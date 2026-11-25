// Only run against a NEW isolated database. No live provider calls.
import "../apps/api/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Test } from "../apps/api/node_modules/@nestjs/testing/index.js";
import { AppModule } from "../apps/api/src/module";
import { AiProvider } from "../apps/api/src/ai";
import { Repository } from "../apps/api/src/repository";
import {
  FileStorage,
  PostgresFileStorage,
  LocalFileStorage,
  configuredFileStorage,
} from "../apps/api/src/documents/storage";
import { reviewAccounts, provisionCloud } from "../deploy/cloud/seed.mjs";
const db = new Repository();
assert.equal(await db.company.count(), 0, "Require fresh isolated database");
process.env.MATERIAL_STORAGE = "postgres";
process.env.ALLOW_PUBLIC_REGISTRATION = "true";
const accounts = ["alpha", "beta"].flatMap((company) =>
  (company === "alpha"
    ? ["OWNER", "MANAGER", "EMPLOYEE", "SUPER_ADMIN"]
    : ["OWNER", "MANAGER", "EMPLOYEE"]
  ).map((role) => ({
    company,
    role,
    email: `${role.toLowerCase()}@${company}.cloud.test`,
    password: randomBytes(24).toString("base64url"),
  })),
);
const parsed = reviewAccounts(JSON.stringify(accounts));
await provisionCloud(db, parsed);
assert.equal(await db.company.count(), 2);
assert.equal(await db.user.count(), 7);
await db.company.update({
  where: { id: "render-review-alpha" },
  data: { balance: { decrement: 1 } },
});
await provisionCloud(db, parsed);
assert.equal(
  (await db.company.findUniqueOrThrow({ where: { id: "render-review-alpha" } }))
    .balance,
  499999,
  "Restart must not reset balance",
);
assert.equal(await db.creditTransaction.count(), 2);
await assert.rejects(
  provisionCloud(
    db,
    parsed.map((a, i) =>
      i === 0 ? { ...a, email: "different@alpha.cloud.test" } : a,
    ),
  ),
);
for (const invalid of [
  "{}",
  "[]",
  JSON.stringify(accounts.map((a) => ({ ...a, password: "short" }))),
])
  assert.throws(() => reviewAccounts(invalid));
const compile = () =>
  Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiProvider)
    .useValue({
      call: () => {
        throw new Error("No AI allowed in storage test");
      },
    })
    .compile();
async function start() {
  const module = await compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, base: await app.getUrl() };
}
let current = await start();
try {
  assert.ok(current.app.get(FileStorage) instanceof PostgresFileStorage);
  async function login(account: (typeof accounts)[number]) {
    const r = await fetch(current.base + "/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    });
    assert.equal(r.status, 201);
    return (await r.json()).token as string;
  }
  const owner = await login(
    accounts.find((a) => a.company === "alpha" && a.role === "OWNER")!,
  );
  const foreign = await login(
    accounts.find((a) => a.company === "beta" && a.role === "OWNER")!,
  );
  const employee = await login(
    accounts.find((a) => a.company === "alpha" && a.role === "EMPLOYEE")!,
  );
  const bytes = Buffer.from(
    "Рабочий регламент: обращение клиента регистрируется в CRM. Сотрудник проверяет факты и отвечает в течение двух рабочих часов. Возврат требует письменного согласования руководителя.",
  );
  const form = new FormData();
  form.set("title", "Durable PostgreSQL attachment");
  form.set("file", new Blob([bytes], { type: "text/plain" }), "policy.txt");
  const upload = await fetch(current.base + "/materials/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${owner}` },
    body: form,
  });
  assert.equal(upload.status, 201);
  const material = await upload.json();
  assert.equal(material.attachmentKey, undefined);
  assert.equal(await db.storedFile.count(), 1);
  const storage = current.app.get(FileStorage);
  await assert.rejects(storage.put(Buffer.alloc(5 * 1024 * 1024 + 1)));
  await assert.rejects(storage.get("../../secret"));
  await current.app.close();
  current = await start();
  for (const token of [owner, employee]) {
    const download = await fetch(
      current.base + `/materials/${material.id}/file`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.match(
      download.headers.get("content-disposition") ?? "",
      /^attachment/,
    );
  }
  assert.equal(
    (
      await fetch(current.base + `/materials/${material.id}/file`, {
        headers: { Authorization: `Bearer ${foreign}` },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(current.base + `/materials/${material.id}/file`)).status,
    401,
  );
  const key = (
    await db.material.findUniqueOrThrow({ where: { id: material.id } })
  ).attachmentKey!;
  await current.app.get(FileStorage).remove(key);
  await assert.rejects(current.app.get(FileStorage).get(key));
  assert.equal(await db.storedFile.count(), 0);
  delete process.env.MATERIAL_STORAGE;
  assert.ok(configuredFileStorage(db) instanceof LocalFileStorage);
  process.env.MATERIAL_STORAGE = "bogus";
  assert.throws(() => configuredFileStorage(db));
  console.log(
    "PASS: real PG bytes + HTTP tenant isolation/download after API restart + idempotent cloud seed; no AI calls",
  );
} finally {
  await current.app.close();
  await db.$disconnect();
}
