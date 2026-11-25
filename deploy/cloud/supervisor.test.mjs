import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { cloudConfig } from "./config.mjs";
import { startManaged, serviceReady } from "./supervisor.mjs";
const env = {
  RENDER: "true",
  REVIEW_TRUST_RENDER: "true",
  RENDER_EXTERNAL_HOSTNAME: "review-test.onrender.com",
  DATABASE_URL: "test",
  DEEPSEEK_API_KEY: "test",
  REVIEW_GATE_USER: "review",
  REVIEW_GATE_PASSWORD: "test-only-password-long-enough-1234567890",
  REVIEW_ACCOUNTS_JSON: "[]",
};
test("cloud bind is restricted to explicit Render HTTPS configuration", () => {
  assert.deepEqual(cloudConfig(env), {
    hostname: "review-test.onrender.com",
    port: 10000,
    bind: "0.0.0.0",
    origin: "https://review-test.onrender.com",
  });
  for (const invalid of [
    { RENDER: "false" },
    { REVIEW_TRUST_RENDER: "false" },
    { RENDER_EXTERNAL_HOSTNAME: "attacker.example" },
    { REVIEW_ALLOW_HTTP: "true" },
    { REVIEW_ALLOW_HTTP_COOKIE: "true" },
    { PORT: "3311" },
    { DEEPSEEK_API_KEY: "" },
  ])
    assert.throws(() => cloudConfig({ ...env, ...invalid }));
});
test("readiness fails closed unless both actual services respond 200", async () => {
  assert.equal(await serviceReady(async () => new Response("ok")), true);
  assert.equal(
    await serviceReady(async () => new Response("bad", { status: 503 })),
    false,
  );
  assert.equal(
    await serviceReady(async () => {
      throw new Error("offline");
    }),
    false,
  );
});
test("supervisor stops the sibling process when a service exits", async () => {
  let fail;
  const failure = new Promise((resolve) => {
    fail = resolve;
  });
  const managed = startManaged(
    [
      {
        file: process.execPath,
        args: ["-e", "setTimeout(()=>process.exit(7),100)"],
        env: {},
      },
      {
        file: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
        env: {},
      },
    ],
    { onFailure: fail, stopMs: 500 },
  );
  const exits = managed.children.map((c) => once(c, "exit"));
  await failure;
  await Promise.all(exits);
  assert.equal(managed.children[0].exitCode, 7);
  assert.equal(managed.children[1].signalCode, "SIGTERM");
});
test("supervisor explicit stop terminates children without failure callback", async () => {
  let failures = 0;
  const managed = startManaged(
    [
      {
        file: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
        env: {},
      },
    ],
    { onFailure: () => failures++ },
  );
  const exit = once(managed.children[0], "exit");
  managed.stop();
  await exit;
  assert.equal(failures, 0);
});
