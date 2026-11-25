import http from "node:http";
import { isIP } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
function credentialHash(value) {
  return createHash("sha256").update(value).digest();
}
export function reviewBindAddress(bind = "127.0.0.1", allowHttp = false) {
  if (
    !isIP(bind) ||
    bind === "0.0.0.0" ||
    bind === "::" ||
    (!allowHttp && !["127.0.0.1", "::1"].includes(bind)) ||
    (allowHttp && isIP(bind) !== 4 && bind !== "::1")
  )
    throw new Error("External review bind requires explicit HTTP review mode");
  return bind;
}
export function createReviewGateway({
  hostname,
  user,
  password,
  upstreamPort = 3300,
  allowHttp = false,
  timeoutMs = 180000,
  maxBodyBytes = 6 * 1024 * 1024,
}) {
  if (allowHttp) {
    const match = /^([0-9.]+):([0-9]+)$/.exec(hostname);
    if (
      !match ||
      isIP(match[1]) !== 4 ||
      Number(match[2]) < 1024 ||
      Number(match[2]) > 65535 ||
      String(Number(match[2])) !== match[2]
    )
      throw new Error(
        "HTTP review requires exact IPv4 authority and explicit port",
      );
  } else if (!/^[a-z0-9.-]+$/i.test(hostname) || !hostname.includes(".")) {
    throw new Error("Exact public review hostname required");
  }
  const protocol = allowHttp ? "http" : "https";
  if (
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(user) ||
    typeof password !== "string" ||
    Buffer.byteLength(password) < 32
  )
    throw new Error(
      "Review gate requires a username and at least 32 random password bytes",
    );
  if (
    !Number.isInteger(upstreamPort) ||
    upstreamPort < 1 ||
    upstreamPort > 65535
  )
    throw new Error("Invalid upstream port");
  const expected = credentialHash(`${user}:${password}`);
  const authorized = (req) => {
    const header = req.headers.authorization;
    if (
      typeof header !== "string" ||
      !header.startsWith("Basic ") ||
      header.length > 4096
    )
      return false;
    return timingSafeEqual(
      expected,
      credentialHash(Buffer.from(header.slice(6), "base64")),
    );
  };
  const response = (res, status, message, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...headers,
    });
    res.end(message);
  };
  const server = http.createServer(
    { maxHeaderSize: 16384 },
    async (req, res) => {
      if (req.headers.host?.toLowerCase() !== hostname.toLowerCase()) {
        response(res, 421, "Unexpected review host");
        req.resume();
        return;
      }
      if (!allowHttp && req.headers["x-forwarded-proto"] !== "https") {
        response(res, 308, "HTTPS required", {
          Location: `https://${hostname}${req.url?.startsWith("/") ? req.url : "/"}`,
        });
        req.resume();
        return;
      }
      if (!authorized(req)) {
        response(res, 401, "Private review access required", {
          "WWW-Authenticate":
            'Basic realm="Praktikum private review", charset="UTF-8"',
        });
        req.resume();
        return;
      }
      const origin = req.headers.origin;
      if (
        (origin && origin !== `${protocol}://${hostname}`) ||
        (allowHttp &&
          !["GET", "HEAD", "OPTIONS"].includes(req.method ?? "") &&
          origin !== `${protocol}://${hostname}`)
      ) {
        response(res, 403, "Unexpected request origin");
        req.resume();
        return;
      }
      if (Number(req.headers["content-length"] ?? 0) > maxBodyBytes) {
        response(res, 413, "Request too large");
        req.resume();
        return;
      }
      const chunks = [];
      let bytes = 0;
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > maxBodyBytes) {
            response(res, 413, "Request too large");
            return;
          }
          chunks.push(chunk);
        }
      } catch {
        if (!res.headersSent) response(res, 400, "Incomplete request");
        return;
      }
      const headers = {
        ...req.headers,
        host: hostname,
        "x-forwarded-host": hostname,
        "x-forwarded-proto": protocol,
        "content-length": String(bytes),
      };
      for (const key of [
        "authorization",
        "proxy-authorization",
        "connection",
        "transfer-encoding",
        "upgrade",
        "forwarded",
        "x-real-ip",
      ])
        delete headers[key];
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: upstreamPort,
          path: req.url,
          method: req.method,
          headers,
        },
        (upstreamResponse) => {
          const outgoing = {
            ...upstreamResponse.headers,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "referrer-policy": "same-origin",
          };
          delete outgoing.connection;
          delete outgoing["transfer-encoding"];
          res.writeHead(upstreamResponse.statusCode ?? 502, outgoing);
          upstreamResponse.pipe(res);
          upstreamResponse.on("error", () => res.destroy());
        },
      );
      upstream.setTimeout(timeoutMs, () =>
        upstream.destroy(new Error("Review upstream timeout")),
      );
      upstream.on("error", () => {
        if (!res.headersSent)
          response(res, 502, "Review service temporarily unavailable");
        else res.destroy();
      });
      res.on("close", () => {
        if (!res.writableEnded) upstream.destroy();
      });
      upstream.end(Buffer.concat(chunks));
    },
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on("upgrade", (req, socket) =>
    socket.end(
      authorized(req)
        ? "HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n"
        : 'HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="Praktikum private review"\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n',
    ),
  );
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const allowHttp = process.env.REVIEW_ALLOW_HTTP === "true";
  const bind = reviewBindAddress(process.env.REVIEW_GATE_BIND, allowHttp);
  const server = createReviewGateway({
    allowHttp,
    hostname: process.env.REVIEW_PUBLIC_HOST ?? "",
    user: process.env.REVIEW_GATE_USER ?? "",
    password: process.env.REVIEW_GATE_PASSWORD ?? "",
    upstreamPort: Number(process.env.REVIEW_UPSTREAM_PORT ?? 3300),
  });
  const port = Number(process.env.REVIEW_GATE_PORT ?? 3390);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid review gateway port");
  server.listen(port, bind, () =>
    console.log(
      `Private review gateway listening on ${bind}:${port}; credentials are never logged`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
