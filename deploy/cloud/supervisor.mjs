import { spawn } from "node:child_process";
export function startManaged(
  commands,
  { onFailure = () => {}, spawnProcess = spawn, stopMs = 8000 } = {},
) {
  const children = [];
  let stopping = false;
  let killTimer;
  function stop() {
    if (stopping) return;
    stopping = true;
    for (const child of children)
      if (child.exitCode === null) child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGKILL");
    }, stopMs);
    killTimer.unref();
  }
  for (const command of commands) {
    const child = spawnProcess(command.file, command.args, {
      env: command.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    children.push(child);
    child.on("error", () => {
      if (!stopping) {
        stop();
        onFailure();
      }
    });
    child.on("exit", () => {
      if (!stopping) {
        stop();
        onFailure();
      }
      if (children.every((c) => c.exitCode !== null)) clearTimeout(killTimer);
    });
  }
  return { children, stop };
}
export async function serviceReady(fetcher = fetch) {
  try {
    const results = await Promise.all([
      fetcher("http://127.0.0.1:3311/health", {
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      }),
      fetcher("http://127.0.0.1:3300/login", {
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      }),
    ]);
    const ready = results.every((r) => r.status === 200);
    await Promise.all(results.map((r) => r.body?.cancel()));
    return ready;
  } catch {
    return false;
  }
}
