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
function isHtmlNavigation(request) {
  return request.method === "GET" && request.headers.get("accept")?.includes("text/html") && request.headers.get("rsc") !== "1";
}
function safeDestination(request) {
  const path = new URL(request.url).pathname;
  if (["/login", "/dashboard", "/register", "/admin"].includes(path)) return path;
  return applicationRequestHeaders(request.headers).has("cookie") ? "/dashboard" : "/login";
}
function startupPage(request, status = 200) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const destination = safeDestination(request);
  const script = `(()=>{const destination=${JSON.stringify(destination)};const started=Date.now();const message=document.getElementById("status");const retry=document.getElementById("retry");retry.addEventListener("click",()=>location.reload());async function check(){const remaining=120000-(Date.now()-started);if(remaining<=0){message.textContent="Сервер пока недоступен. Нажмите кнопку, чтобы проверить ещё раз.";retry.hidden=false;return;}const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(8000,remaining));try{const response=await fetch("/_review/ready",{cache:"no-store",credentials:"same-origin",headers:{Accept:"application/json"},signal:controller.signal});if(response.status===204){message.textContent="Готово. Открываем пространство…";location.replace(destination);return;}}catch{}finally{clearTimeout(timer);}setTimeout(check,2000);}check();})();`;
  return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Практикум — запускаем пространство</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f4f7f8;color:#173137;font:17px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,540px);background:#fff;border:1px solid #dce7e8;border-radius:24px;padding:40px;box-shadow:0 12px 40px #14383c09}.brand{font-size:24px;font-weight:800;color:#127f86}h1{font-size:29px;line-height:1.25;margin:28px 0 16px}p{color:#526b70}.pulse{height:5px;border-radius:8px;background:#16969d;margin:28px 0;animation:pulse 1.5s ease-in-out infinite alternate}button{min-height:44px;padding:10px 18px;border:0;border-radius:10px;background:#127f86;color:white;font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #173137;outline-offset:3px}@keyframes pulse{to{opacity:.25}}@media(prefers-reduced-motion:reduce){.pulse{animation:none}}@media(max-width:480px){.card{padding:24px}h1{font-size:25px}}</style><main class="card"><div class="brand">практикум</div><h1>Готовим рабочее пространство</h1><p>Бесплатный сервер может запускаться около минуты. Как только он будет готов, пространство откроется автоматически.</p><div class="pulse" aria-hidden="true"></div><p id="status" role="status" aria-live="polite">Проверяем готовность сервиса…</p><button id="retry" hidden type="button">Проверить ещё раз</button><noscript><p>Для автоматической проверки нужен JavaScript. Через минуту откройте <a href="${destination}">пространство</a>.</p></noscript></main><script nonce="${nonce}">${script}</script></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "CDN-Cache-Control": "no-store", "Cloudflare-CDN-Cache-Control": "no-store", "Retry-After": "5", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` },
  });
}
function unavailable(request) {
  if (isHtmlNavigation(request) && new URL(request.url).pathname !== "/_review/ready") return startupPage(request, 503);
  return new Response(request.method === "HEAD" ? null : "Сервис временно недоступен. Перед повторной отправкой проверьте результат операции.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5", "X-Content-Type-Options": "nosniff" },
  });
}
export async function proxyRequest(request, env, upstreamFetch = fetch, options = {}) {
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const diagnose = reason => (options.log ?? (entry => console.warn(JSON.stringify(entry))))({ event: "edge_proxy_unavailable", reason, method: SAFE_METHODS.has(request.method) ? request.method : "MUTATION" });
  let site;
  try { site = configuredOrigin(env); } catch { return failure(502); }
  const incoming = new URL(request.url);
  if (incoming.origin !== site.origin ||
      (request.headers.has("host") && request.headers.get("host").toLowerCase() !== site.host.toLowerCase()))
    return failure(421);
  const origin = request.headers.get("origin");
  if ((origin && origin !== site.origin) || (!SAFE_METHODS.has(request.method) && origin !== site.origin))
    return failure(403);
  // This public shell contains no app data. BasicAuth remains enforced at the destination.
  if (incoming.pathname === "/" && isHtmlNavigation(request)) return startupPage(request);
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
  let upstream;
  const maximumAttempts = SAFE_METHODS.has(request.method) ? 2 : 1;
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    let reason;
    try {
      upstream = await upstreamFetch(target.href, {
        method: request.method, headers, ...(body ? { body, duplex: "half" } : {}),
        redirect: "manual", signal: request.signal,
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      if ([502, 503, 504].includes(upstream.status)) reason = `upstream_http_${upstream.status}`;
      else break;
    } catch {
      if (exceeded) return failure(413);
      reason = "upstream_transport";
    }
    diagnose(reason);
    await upstream?.body?.cancel().catch(() => undefined);
    upstream = undefined;
    if (attempt + 1 < maximumAttempts && !request.signal?.aborted) await pause(600);
    else return unavailable(request);
  }
  try {
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
    diagnose("upstream_response_rejected");
    return failure(exceeded ? 413 : 502);
  }
}
export default { fetch(request, env) { return proxyRequest(request, env); } };
