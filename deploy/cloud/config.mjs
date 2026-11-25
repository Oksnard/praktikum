import { reviewBindAddress } from "../review-gateway.mjs";
export function cloudConfig(env) {
  const hostname = env.RENDER_EXTERNAL_HOSTNAME;
  if (
    env.RENDER !== "true" ||
    env.REVIEW_TRUST_RENDER !== "true" ||
    typeof hostname !== "string" ||
    !/^[a-z0-9-]+\.onrender\.com$/.test(hostname) ||
    env.REVIEW_ALLOW_HTTP === "true" ||
    env.REVIEW_ALLOW_HTTP_COOKIE === "true"
  )
    throw new Error("Explicit Render HTTPS review configuration required");
  for (const name of [
    "DATABASE_URL",
    "DEEPSEEK_API_KEY",
    "REVIEW_GATE_USER",
    "REVIEW_GATE_PASSWORD",
    "REVIEW_ACCOUNTS_JSON",
  ])
    if (!env[name]) throw new Error(`Missing required cloud variable: ${name}`);
  const port = Number(env.PORT ?? 10000);
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    [3300, 3311].includes(port)
  )
    throw new Error("Invalid public cloud port");
  return {
    hostname,
    port,
    bind: reviewBindAddress("0.0.0.0", false, true),
    origin: `https://${hostname}`,
  };
}
