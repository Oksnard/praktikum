import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = path.join(root, "apps/web");
const isolated = path.join(root, ".runtime/playwright/web-app");

async function start() {
  await rm(isolated, { recursive: true, force: true });
  await mkdir(isolated, { recursive: true });
  await cp(source, isolated, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry);
      return ![".next", "node_modules", ".turbo"].some(
        (blocked) => relative === blocked || relative.startsWith(`${blocked}/`),
      );
    },
  });
  await symlink(
    path.join(source, "node_modules"),
    path.join(isolated, "node_modules"),
  );
  const configPath = path.join(isolated, "next.config.ts");
  const config = await readFile(configPath, "utf8");
  if (!config.includes("transpilePackages:")) {
    throw new Error("Unexpected Next config; refusing to patch isolated copy");
  }
  await writeFile(
    configPath,
    config.replace(
      "const nextConfig: NextConfig = {",
      'const nextConfig: NextConfig = { distDir: ".next-playwright",',
    ),
  );

  const nextCli = path.join(source, "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3200"],
    {
      cwd: isolated,
      env: {
        ...process.env,
        API_URL: "http://127.0.0.1:3211",
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
    },
  );
  const stop = () => child.kill("SIGTERM");
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

void start().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
