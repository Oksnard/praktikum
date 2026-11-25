import { spawn } from "node:child_process";
import { createReviewGateway } from "../review-gateway.mjs";
import { cloudConfig } from "./config.mjs";
import { seedFromEnvironment } from "./seed.mjs";
import { startManaged, serviceReady } from "./supervisor.mjs";
const config = cloudConfig(process.env);
// One immutable release, fresh database migrations before public readiness.
const migrate = spawn(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "apps/api/prisma/schema.prisma",
  ],
  { env: process.env, stdio: ["ignore", "ignore", "ignore"] },
);
await new Promise((resolve, reject) => {
  migrate.on("error", () =>
    reject(new Error("Cloud migration could not start")),
  );
  migrate.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error("Cloud migration failed; inspect DB configuration")),
  );
});
await seedFromEnvironment(process.env);
const shared = {
  ...process.env,
  NODE_ENV: "production",
  PUBLIC_ORIGIN: config.origin,
  API_URL: "http://127.0.0.1:3311",
  MATERIAL_STORAGE: "postgres",
  AI_PROVIDER: "deepseek",
  REVIEW_ALLOW_HTTP_COOKIE: "false",
};
// Next never receives provider/database/admin provisioning secrets.
const webEnv = {
  NODE_ENV: "production",
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  PUBLIC_ORIGIN: config.origin,
  API_URL: shared.API_URL,
  NEXT_TELEMETRY_DISABLED: "1",
};
const apiEnv = {
  ...shared,
  PORT: "3311",
  NODE_OPTIONS: "--max-old-space-size=160",
};
for (const key of [
  "REVIEW_ACCOUNTS_JSON",
  "REVIEW_GATE_USER",
  "REVIEW_GATE_PASSWORD",
])
  delete apiEnv[key];
let gate;
const services = startManaged(
  [
    {
      file: process.execPath,
      args: ["apps/api/dist/src/main.js"],
      env: apiEnv,
    },
    {
      file: process.execPath,
      args: [
        "apps/web/node_modules/next/dist/bin/next",
        "start",
        "apps/web",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3300",
      ],
      env: { ...webEnv, NODE_OPTIONS: "--max-old-space-size=192" },
    },
  ],
  {
    onFailure: () => {
      process.exitCode = 1;
      gate?.close();
    },
  },
);
gate = createReviewGateway({
  hostname: config.hostname,
  user: process.env.REVIEW_GATE_USER,
  password: process.env.REVIEW_GATE_PASSWORD,
  trustedRender: true,
  readiness: () => serviceReady(),
});
gate.listen(config.port, config.bind);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    services.stop();
    gate.close();
  });
gate.on("error", () => {
  process.exitCode = 1;
  services.stop();
});
console.log(
  "Cloud review starting; readiness remains closed until API and web are ready.",
);
