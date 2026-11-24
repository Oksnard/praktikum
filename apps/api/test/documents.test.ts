import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { Material, User } from "@prisma/client";
import { DocumentParser, MAX_FILE_BYTES } from "../src/documents/parser";
import { DocumentsController } from "../src/documents/controller";
import { DocumentsService } from "../src/documents/service";
import { FileStorage, LocalFileStorage } from "../src/documents/storage";
import { Repository } from "../src/repository";
import { AuthGuard } from "../src/auth";
const fixture = (name: string) =>
  readFile(join(__dirname, "document-fixtures", name));
const mime: Record<string, string> = {
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};
const parser = new DocumentParser();
for (const name of [
  "russian.txt",
  "russian-cp1251.txt",
  "russian-utf16.txt",
  "russian.docx",
  "russian.pdf",
  "russian.doc",
]) {
  test(`real Cyrillic extraction: ${name}`, async () => {
    const result = await parser.extract({
      originalname: name,
      mimetype: mime[name.split(".").pop()!],
      buffer: await fixture(name),
    });
    assert.match(result.text, /Перед встречей сотрудник/);
    assert.match(result.text, /следующий шаг/);
  });
}
test("malformed, spoofed, ZIP bomb, binary TXT, oversize and scan reject without truncation", async () => {
  for (const name of ["entity.docx", "entity-utf16.docx"])
    await assert.rejects(
      parser.extract({
        originalname: name,
        mimetype: mime.docx,
        buffer: await fixture(name),
      }),
    );
  for (const input of [
    {
      originalname: "bad.pdf",
      mimetype: mime.pdf,
      buffer: Buffer.from("not a PDF"),
    },
    {
      originalname: "bad.pdf",
      mimetype: mime.pdf,
      buffer: Buffer.from("%PDF-1.4 corrupt"),
    },
    {
      originalname: "bad.docx",
      mimetype: mime.docx,
      buffer: Buffer.from("PK\x03\x04broken"),
    },
    {
      originalname: "bomb.docx",
      mimetype: mime.docx,
      buffer: await fixture("bomb.docx"),
    },
    { originalname: "bad.txt", mimetype: mime.txt, buffer: Buffer.alloc(100) },
    {
      originalname: "large.txt",
      mimetype: mime.txt,
      buffer: Buffer.alloc(MAX_FILE_BYTES + 1, 65),
    },
    {
      originalname: "long.txt",
      mimetype: mime.txt,
      buffer: Buffer.alloc(12001, 65),
    },
    {
      originalname: "scan.pdf",
      mimetype: mime.pdf,
      buffer: await fixture("scan.pdf"),
    },
    {
      originalname: "encrypted.pdf",
      mimetype: mime.pdf,
      buffer: await fixture("encrypted.pdf"),
    },
    {
      originalname: "russian.txt",
      mimetype: mime.pdf,
      buffer: await fixture("russian.txt"),
    },
  ])
    await assert.rejects(parser.extract(input));
});
test("HTTP multipart authorization, tenant download, bytes and failed-write cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "praktikum-storage-test-"));
  process.env.MATERIAL_UPLOAD_DIR = root;
  const materials: Material[] = [];
  const users = new Map(
    ["owner", "manager", "employee", "other"].map((key) => [
      key,
      {
        id: key,
        companyId: key === "other" ? "tenant-b" : "tenant-a",
        role:
          key === "employee"
            ? "EMPLOYEE"
            : key === "manager"
              ? "MANAGER"
              : "OWNER",
      } as User,
    ]),
  );
  // Only database persistence is replaced; multipart, real parsers, guards and private disk are exercised.
  let failWrite = false;
  const db = {
    session: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const { digest } = await import("../src/auth");
        const entry = [...users].find(([token]) => digest(token) === where.id);
        return entry
          ? { user: entry[1], expiresAt: new Date(Date.now() + 10000) }
          : null;
      },
    },
    material: {
      create: async ({
        data,
      }: {
        data: Omit<Material, "id" | "createdAt">;
      }) => {
        if (failWrite) throw new Error("database unavailable");
        const material = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: new Date(),
        };
        materials.push(material);
        return material;
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; companyId: string };
      }) =>
        materials.find(
          (m) => m.id === where.id && m.companyId === where.companyId,
        ) ?? null,
    },
  } as unknown as Repository;
  const module = await Test.createTestingModule({
    controllers: [DocumentsController],
    providers: [
      DocumentsService,
      DocumentParser,
      { provide: Repository, useValue: db },
      { provide: FileStorage, useClass: LocalFileStorage },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const bytes = await fixture("russian.docx");
  const upload = async (
    token: string,
    buffer = bytes,
    title = "Регламент клиента",
  ) => {
    const form = new FormData();
    form.set("title", title);
    form.set(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mime.docx }),
      "russian.docx",
    );
    return fetch(base + "/materials/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  };
  try {
    assert.equal((await upload("")).status, 401);
    assert.equal((await upload("employee")).status, 403);
    assert.equal(
      (await upload("owner", Buffer.from("wrong magic"))).status,
      400,
    );
    assert.equal(
      (await upload("owner", Buffer.alloc(MAX_FILE_BYTES + 1))).status,
      413,
    );
    const result = await upload("owner");
    assert.equal(result.status, 201);
    const material = (await result.json()) as Material;
    assert.equal(material.attachmentKey, undefined);
    assert.match(material.text, /Перед встречей/);
    assert.equal(material.attachmentSize, bytes.length);
    assert.equal((await upload("manager")).status, 201);
    const download = (token: string, id = material.id) =>
      fetch(`${base}/materials/${id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    assert.equal((await download("other")).status, 404);
    assert.equal((await download("employee", "missing")).status, 404);
    const file = await download("employee");
    assert.equal(file.status, 200);
    assert.match(file.headers.get("content-disposition")!, /attachment/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    const before = await readdir(root);
    failWrite = true;
    assert.equal((await upload("owner")).status, 500);
    assert.deepEqual(await readdir(root), before);
    const storage = app.get(FileStorage);
    await assert.rejects(async () => storage.get("../../etc/passwd"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
    delete process.env.MATERIAL_UPLOAD_DIR;
  }
});

test("hard deadline kills TERM-ignoring converter and its descendants", async () => {
  const { runDocumentCommand } = await import("../src/documents/parser");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "praktikum-process-test-"));
  const parentFile = join(dir, "parent");
  const descendantFile = join(dir, "descendants");
  const leaf = `process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const branch = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(descendantFile)},JSON.stringify([process.pid,c.pid]));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const script = `require('node:fs').writeFileSync(${JSON.stringify(parentFile)},String(process.pid));require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(branch)}],{stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  try {
    const started = Date.now();
    await assert.rejects(
      runDocumentCommand(process.execPath, ["-e", script], { timeoutMs: 700 }),
    );
    assert.ok(
      Date.now() - started < 2000,
      "hard deadline must settle even with inherited pipes",
    );
    const descendants = JSON.parse(
      await readFile(descendantFile, "utf8"),
    ) as number[];
    const pids = [Number(await readFile(parentFile, "utf8")), ...descendants];
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (const pid of pids) {
      let state = "";
      try {
        state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], {
          encoding: "utf8",
        }).trim();
      } catch {
        /* No process means killed. */
      }
      assert.ok(
        !state || state.startsWith("Z"),
        `descendant ${pid} still running: ${state}`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PDF raw whitespace overflow rejects the whole source before a later page", async () => {
  await assert.rejects(
    parser.extract({
      originalname: "whitespace-overflow.pdf",
      mimetype: mime.pdf,
      buffer: await fixture("whitespace-overflow.pdf"),
    }),
    /больше 12 000/,
  );
});

test("resource watchdog bounds aggregate RSS of converter descendants", async () => {
  const { runDocumentCommand } = await import("../src/documents/parser");
  const leaf = `global.memory=Buffer.alloc(60*1024*1024,1);setInterval(()=>{},1000);`;
  const script = `global.memory=Buffer.alloc(60*1024*1024,1);require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'inherit'});setInterval(()=>{},1000);`;
  const started = Date.now();
  await assert.rejects(
    runDocumentCommand(process.execPath, ["-e", script], {
      timeoutMs: 4000,
      rssKiB: 145 * 1024,
    }),
  );
  assert.ok(
    Date.now() - started < 2500,
    "aggregate RSS must kill before hard deadline",
  );
});
