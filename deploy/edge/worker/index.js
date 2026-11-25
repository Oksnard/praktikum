const UPSTREAM_ORIGIN = "https://praktikum-review-vhyg.onrender.com";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const SAFE_METHODS = new Set(["GET", "HEAD"]);
function failure(status) {
  return new Response(status === 403 ? "Request origin denied" : status === 421 ? "Unexpected site authority" : status === 413 ? "Request too large" : "Demo service temporarily unavailable", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function configuredOrigin(env) {
  const configured = env?.PUBLIC_SITE_ORIGIN;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.origin !== configured || url.username || url.password)
    throw new Error("Exact configured HTTPS origin required");
  return url;
}
const REQUEST_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language", "content-type", "content-length",
  "content-encoding", "user-agent", "origin", "range", "if-range", "if-none-match",
  "if-modified-since", "rsc", "next-action", "next-router-state-tree", "next-router-prefetch",
  "next-router-segment-prefetch", "next-url", "x-nextjs-data", "sec-fetch-dest", "sec-fetch-mode",
  "sec-fetch-site", "priority",
]);
function applicationRequestHeaders(incoming) {
  const headers = new Headers();
  for (const [key, value] of incoming) if (REQUEST_HEADERS.has(key)) headers.set(key, value);
  const auth = incoming.get("authorization");
  if (auth && /^Basic [A-Za-z0-9+/]+={0,2}$/i.test(auth)) headers.set("authorization", auth);
  const session = incoming.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith("praktikum_session="));
  if (session) headers.set("cookie", session);
  return headers;
}
function stripForwarding(headers) {
  for (const key of [...headers.keys()])
    if (key === "forwarded" || key.startsWith("x-forwarded-") || key.startsWith("cf-") || key.startsWith("oai-") || key.startsWith("x-oai-") ||
      ["x-real-ip", "x-original-host", "proxy-authorization", "proxy-connection", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"].includes(key))
      headers.delete(key);
}
function cookies(headers) {
  if (!headers.has("set-cookie")) return [];
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers.getAll === "function") return headers.getAll("Set-Cookie");
  throw new Error("Lossless cookie API unavailable");
}
function hostOnlyCookie(cookie) {
  if (cookie.slice(0, cookie.indexOf("=")).trim() !== "praktikum_session") return null;
  return cookie.split(";").filter((part, index) => {
    if (!index || !/^\s*domain\s*=/i.test(part)) return true;
    const domain = part.slice(part.indexOf("=") + 1).trim().toLowerCase().replace(/^\./, "");
    if (domain !== new URL(UPSTREAM_ORIGIN).hostname) throw new Error("Unexpected cookie domain");
    return false;
  }).join(";");
}
export async function proxyRequest(request, env, upstreamFetch = fetch) {
  let site;
  try { site = configuredOrigin(env); } catch { return failure(502); }
  const incoming = new URL(request.url);
  if (incoming.origin !== site.origin ||
      (request.headers.has("host") && request.headers.get("host").toLowerCase() !== site.host.toLowerCase()))
    return failure(421);
  const origin = request.headers.get("origin");
  if ((origin && origin !== site.origin) || (!SAFE_METHODS.has(request.method) && origin !== site.origin))
    return failure(403);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return failure(413);
  // Assigning pathname cannot reinterpret //evil or encoded slashes as an upstream authority.
  const target = new URL(UPSTREAM_ORIGIN);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = applicationRequestHeaders(request.headers);
  stripForwarding(headers);
  headers.set("host", target.host);
  headers.set("x-forwarded-host", target.host);
  headers.set("x-forwarded-proto", "https");
  if (origin) headers.set("origin", UPSTREAM_ORIGIN);
  headers.set("cache-control", "no-store");
  let exceeded = false;
  let bytes = 0;
  const body = request.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BODY_BYTES) { exceeded = true; throw new Error("Body limit"); }
      controller.enqueue(chunk);
    },
  }));
  try {
    const upstream = await upstreamFetch(target.href, {
      method: request.method, headers, ...(body ? { body, duplex: "half" } : {}),
      redirect: "manual", signal: request.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const outgoing = new Headers(upstream.headers);
    stripForwarding(outgoing);
    outgoing.delete("set-cookie");
    for (const cookie of cookies(upstream.headers)) {
      const appCookie = hostOnlyCookie(cookie);
      if (appCookie) outgoing.append("set-cookie", appCookie);
    }
    const location = outgoing.get("location");
    if (location) {
      const redirect = new URL(location, UPSTREAM_ORIGIN);
      if (redirect.origin !== UPSTREAM_ORIGIN) throw new Error("Unexpected redirect authority");
      const destination = new URL(site.origin);
      destination.pathname = redirect.pathname;
      destination.search = redirect.search;
      destination.hash = redirect.hash;
      outgoing.set("location", destination.href);
    }
    outgoing.set("cache-control", "no-store");
    outgoing.set("cdn-cache-control", "no-store");
    outgoing.set("cloudflare-cdn-cache-control", "no-store");
    outgoing.set("pragma", "no-cache");
    outgoing.delete("age");
    return new Response(upstream.body, {status: upstream.status, statusText: upstream.statusText, headers: outgoing});
  } catch {
    return failure(exceeded ? 413 : 502);
  }
}
export default { fetch(request, env) { return proxyRequest(request, env); } };
