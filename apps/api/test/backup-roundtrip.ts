import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/module";
import { Repository } from "../src/repository";
import { digest, hashPassword } from "../src/auth";
import { criteria } from "@praktikum/types";
import type { INestApplication } from "@nestjs/common";
const url = new URL(process.env.DATABASE_URL ?? "");
const pgEnv = {
  PATH: process.env.PATH,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: "postgres",
};
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const sourceName = "praktikum_backup_source_" + suffix,
  restoredName = "praktikum_backup_restored_" + suffix;
const workspace = path.resolve(".runtime/backup-roundtrip-" + suffix);
const sourceFiles = path.join(workspace, "source-files"),
  restoredFiles = path.join(workspace, "restored-files"),
  backups = path.join(workspace, "backups");
const dbUrl = (name: string) => {
  const u = new URL(url);
  u.pathname = "/" + name;
  return u.toString();
};
function run(command: string, args: string[], env: NodeJS.ProcessEnv = pgEnv) {
  const r = spawnSync(command, args, {
    env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(
      `${command} verification step failed (exit ${r.status ?? "spawn"}); credentials suppressed`,
    );
  return r.stdout;
}
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function main() {
  let source: PrismaClient | undefined;
  let app: INestApplication | undefined;
  try {
    await mkdir(sourceFiles, { recursive: true, mode: 0o700 });
    await mkdir(restoredFiles, { recursive: true, mode: 0o700 });
    run("createdb", ["--maintenance-db=postgres", sourceName]);
    run("createdb", ["--maintenance-db=postgres", restoredName]);
    run(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "apps/api/prisma/schema.prisma",
      ],
      { PATH: process.env.PATH, DATABASE_URL: dbUrl(sourceName) },
    );
    source = new PrismaClient({
      datasources: { db: { url: dbUrl(sourceName) } },
    });
    const company = await source.company.create({
      data: { name: "Backup roundtrip verification", criteria },
    });
    const user = await source.user.create({
      data: {
        companyId: company.id,
        name: "Backup verifier",
        email: `${suffix}@backup.test`,
        role: "EMPLOYEE",
        passwordHash: hashPassword(randomUUID()),
      },
    });
    const token = randomUUID() + randomUUID();
    await source.session.create({
      data: {
        id: digest(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const key = randomUUID(),
      bytes = Buffer.from(
        "Сотрудник регистрирует обращение в CRM и подтверждает получение в течение двух часов.",
      );
    await writeFile(path.join(sourceFiles, key), bytes, { mode: 0o600 });
    const material = await source.material.create({
      data: {
        companyId: company.id,
        title: "Backup document",
        text: bytes.toString("utf8"),
        attachmentKey: key,
        attachmentName: "source.txt",
        attachmentMime: "text/plain",
        attachmentSize: bytes.length,
      },
    });
    await source.$disconnect();
    source = undefined;
    run(process.execPath, ["deploy/backup.mjs"], {
      PATH: process.env.PATH,
      DATABASE_URL: dbUrl(sourceName),
      MATERIAL_UPLOAD_DIR: sourceFiles,
      BACKUP_DIR: backups,
    });
    const manifestName = (await readdir(backups)).find((n) =>
      n.endsWith(".manifest.json"),
    );
    assert.ok(manifestName);
    const manifest = JSON.parse(
      await readFile(path.join(backups, manifestName), "utf8"),
    ) as {
      dump: { file: string; sha256: string };
      uploads: {
        file: string;
        sha256: string;
        files: { key: string; sha256: string; size: number }[];
      };
    };
    for (const filename of [
      manifestName,
      manifest.dump.file,
      manifest.uploads.file,
    ])
      assert.equal(
        (await stat(path.join(backups, filename))).mode & 0o777,
        0o600,
      );
    assert.equal(
      hash(await readFile(path.join(backups, manifest.dump.file))),
      manifest.dump.sha256,
    );
    assert.equal(
      hash(await readFile(path.join(backups, manifest.uploads.file))),
      manifest.uploads.sha256,
    );
    run("pg_restore", [
      "--no-owner",
      "--exit-on-error",
      "--dbname=" + restoredName,
      path.join(backups, manifest.dump.file),
    ]);
    run("tar", [
      "-xzf",
      path.join(backups, manifest.uploads.file),
      "-C",
      restoredFiles,
      "--no-same-owner",
    ]);
    assert.equal(
      hash(await readFile(path.join(restoredFiles, key))),
      hash(bytes),
    );
    assert.equal(manifest.uploads.files[0].sha256, hash(bytes));
    process.env.MATERIAL_UPLOAD_DIR = restoredFiles;
    const repository = new Repository({
      datasources: { db: { url: dbUrl(restoredName) } },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Repository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.listen(0, "127.0.0.1");
    const response = await fetch(
      `${await app.getUrl()}/materials/${material.id}/file`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(bytes));
    await app.close();
    app = undefined;
    console.log(
      JSON.stringify({
        backupRestore: "PASS",
        sourceDatabasesTouched:
          "two isolated ephemeral verification databases only",
        restoredAuthenticatedDownload: "PASS",
        fileHash: hash(bytes),
        attachmentCount: 1,
        credentialsPrinted: false,
      }),
    );
  } finally {
    if (app) await app.close();
    if (source) await source.$disconnect();
    for (const name of [sourceName, restoredName])
      run("dropdb", [
        "--maintenance-db=postgres",
        "--if-exists",
        "--force",
        name,
      ]);
    await rm(workspace, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Backup verification failed",
  );
  process.exitCode = 1;
});
