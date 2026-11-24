import {
  mkdir,
  readdir,
  rename,
  stat,
  lstat,
  unlink,
  writeFile,
  chmod,
  readFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("PostgreSQL URL required");
const directory = path.resolve(
  process.env.BACKUP_DIR ?? "/opt/praktikum/data/backups",
);
const storage = process.env.MATERIAL_UPLOAD_DIR;
if (!storage)
  throw new Error(
    "MATERIAL_UPLOAD_DIR required for a complete database and attachment backup",
  );
const pgEnv = {
  PATH: process.env.PATH,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  ...(url.searchParams.has("sslmode")
    ? { PGSSLMODE: url.searchParams.get("sslmode") }
    : {}),
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: pgEnv,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} backup step failed (exit ${result.status ?? "spawn"}); no credentials printed`,
    );
  return result.stdout;
}
async function sha256(file) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
process.umask(0o077);
const stem = `praktikum-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const dump = stem + ".dump";
const archive = stem + ".uploads.tar.gz";
const manifest = stem + ".manifest.json";
// DB snapshot first, then immutable files: later appends are harmless, referenced files already exist.
run("pg_dump", [
  "--format=custom",
  "--file",
  path.join(directory, dump + ".tmp"),
]);
const keys = run("psql", [
  "-X",
  "--tuples-only",
  "--no-align",
  "--set",
  "ON_ERROR_STOP=1",
  "--command",
  'SELECT DISTINCT "attachmentKey" FROM "Material" WHERE "attachmentKey" IS NOT NULL ORDER BY "attachmentKey"',
])
  .trim()
  .split("\n")
  .filter(Boolean);
const files = [];
for (const key of keys) {
  if (!/^[a-f0-9-]{36}$/.test(key))
    throw new Error("Invalid attachment key in database");
  const file = path.join(storage, key);
  const metadata = await lstat(file);
  if (!metadata.isFile()) throw new Error("Attachment is not a regular file");
  files.push({ key, size: metadata.size, sha256: await sha256(file) });
}
if (files.length)
  run(
    "tar",
    [
      "-czf",
      path.join(directory, archive + ".tmp"),
      "-C",
      path.resolve(storage),
      "-T",
      "-",
    ],
    { input: keys.join("\n") + "\n" },
  );
const record = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  consistency:
    "database-first, immutable append-only attachments; quiesce before future delete/update support",
  dump: {
    file: dump,
    sha256: await sha256(path.join(directory, dump + ".tmp")),
  },
  uploads: {
    file: files.length ? archive : null,
    sha256: files.length
      ? await sha256(path.join(directory, archive + ".tmp"))
      : null,
    files,
  },
};
await rename(path.join(directory, dump + ".tmp"), path.join(directory, dump));
if (files.length)
  await rename(
    path.join(directory, archive + ".tmp"),
    path.join(directory, archive),
  );
await writeFile(
  path.join(directory, manifest + ".tmp"),
  JSON.stringify(record, null, 2),
  { mode: 0o600, flag: "wx" },
);
await rename(
  path.join(directory, manifest + ".tmp"),
  path.join(directory, manifest),
);
// A backup set is complete only when its manifest exists. Retain all assets as one set.
for (const name of await readdir(directory)) {
  if (!/^praktikum-.*\.manifest\.json$/.test(name)) continue;
  const file = path.join(directory, name);
  if ((await stat(file)).mtimeMs >= Date.now() - 7 * 86400000) continue;
  const old = JSON.parse(await readFile(file, "utf8"));
  for (const asset of [old.dump?.file, old.uploads?.file].filter(Boolean)) {
    if (!/^praktikum-[a-zA-Z0-9T-]+\.(dump|uploads\.tar\.gz)$/.test(asset))
      throw new Error("Invalid old backup manifest");
    await unlink(path.join(directory, asset));
  }
  await unlink(file);
}
console.log(
  `PostgreSQL and ${files.length} attachment(s) backed up; complete manifest published; retained up to seven days.`,
);
