import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
const output = process.argv[2];
if (!output)
  throw new Error("Usage: node deploy/render.mjs PRIVATE_OUTPUT_DIRECTORY");
const appRoot = process.env.DEPLOY_APP_ROOT ?? "/opt/praktikum";
const hostname = process.env.DEPLOY_HOSTNAME ?? "";
const user = process.env.DEPLOY_RUN_USER ?? "praktikum";
const nodeBin = process.env.DEPLOY_NODE_BIN ?? "/usr/bin/node";
const apiPort = Number(process.env.DEPLOY_API_PORT ?? 3311);
const webPort = Number(process.env.DEPLOY_WEB_PORT ?? 3300);
if (!/^[a-zA-Z0-9.-]+$/.test(hostname) || !hostname.includes("."))
  throw new Error("Set DEPLOY_HOSTNAME to the assigned public hostname");
if (!/^[a-z_][a-z0-9_-]*$/.test(user))
  throw new Error("Invalid service username");
for (const p of [appRoot, nodeBin])
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(p))
    throw new Error(
      "Deployment paths must be absolute and contain no whitespace",
    );
for (const port of [apiPort, webPort])
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid isolated port");
if (apiPort === webPort) throw new Error("API and web ports must differ");
const replacements = {
  APP_ROOT: appRoot,
  RUN_USER: user,
  NODE_BIN: nodeBin,
  HOSTNAME: hostname,
  API_PORT: String(apiPort),
  WEB_PORT: String(webPort),
  TLS_CERT_PATH:
    process.env.DEPLOY_TLS_CERT_PATH ??
    `/etc/letsencrypt/live/${hostname}/fullchain.pem`,
  TLS_KEY_PATH:
    process.env.DEPLOY_TLS_KEY_PATH ??
    `/etc/letsencrypt/live/${hostname}/privkey.pem`,
};
for (const p of [replacements.TLS_CERT_PATH, replacements.TLS_KEY_PATH])
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(p)) throw new Error("Invalid TLS path");
await mkdir(output, { recursive: true, mode: 0o700 });
for (const directory of ["systemd", "nginx"])
  for (const name of await readdir(`deploy/${directory}`)) {
    const source = await readFile(`deploy/${directory}/${name}`, "utf8");
    const rendered = source.replace(/__([A-Z_]+)__/g, (_, key) => {
      if (!(key in replacements)) throw new Error("Unknown template field");
      return replacements[key];
    });
    await writeFile(path.join(output, name.replace(/\.in$/, "")), rendered, {
      mode: 0o600,
    });
  }
console.log(
  "Rendered deployment files locally; no service or host configuration changed.",
);
