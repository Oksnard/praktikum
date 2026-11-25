import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createReviewGateway } from "./review-gateway.mjs";
const hostname = "private-review.trycloudflare.com";
const password = "test-only-random-shaped-secret-1234567890";
const auth = "Basic " + Buffer.from("review:" + password).toString("base64");
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}
function request(port, headers = {}, body = "", pathname = "/login") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: body ? "POST" : "GET",
        headers: { Host: hostname, "X-Forwarded-Proto": "https", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, data }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
test("review gate protects every path and proxies only sanitized authenticated requests", async () => {
  const upstream = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ headers: req.headers, url: req.url, body }));
  });
  const upstreamPort = await listen(upstream);
  const gate = createReviewGateway({
    hostname,
    user: "review",
    password,
    upstreamPort,
    maxBodyBytes: 100,
  });
  const port = await listen(gate);
  try {
    for (const pathname of [
      "/login",
      "/dashboard",
      "/health",
      "/_next/static/test.js",
    ]) {
      const r = await request(port, {}, "", pathname);
      assert.equal(r.status, 401);
      assert.match(r.headers["www-authenticate"], /^Basic/);
      assert.equal(r.headers["cache-control"], "no-store");
    }
    assert.equal(
      (
        await request(port, {
          Authorization:
            "Basic " + Buffer.from("review:wrong").toString("base64"),
        })
      ).status,
      401,
    );
    const redirect = await request(port, { "X-Forwarded-Proto": "http" });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `https://${hostname}/login`);
    assert.equal(redirect.headers["www-authenticate"], undefined);
    assert.equal(
      (await request(port, { Host: "attacker.example", Authorization: auth }))
        .status,
      421,
    );
    assert.equal(
      (
        await request(port, {
          Authorization: auth,
          Origin: "https://attacker.example",
        })
      ).status,
      403,
    );
    const result = await request(
      port,
      {
        Authorization: auth,
        Origin: `https://${hostname}`,
        "X-Forwarded-Host": "attacker.example",
        Forwarded: "host=attacker.example",
      },
      "answer",
    );
    assert.equal(result.status, 200);
    const data = JSON.parse(result.data);
    assert.equal(data.headers.authorization, undefined);
    assert.equal(data.headers.forwarded, undefined);
    assert.equal(data.headers.host, hostname);
    assert.equal(data.headers["x-forwarded-host"], hostname);
    assert.equal(data.headers["x-forwarded-proto"], "https");
    assert.equal(data.headers.origin, `https://${hostname}`);
    assert.equal(data.body, "answer");
    assert.equal(
      (
        await request(
          port,
          { Authorization: auth, "Content-Length": "101" },
          "x".repeat(101),
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await request(
          port,
          { Authorization: auth, "Transfer-Encoding": "chunked" },
          "x".repeat(101),
        )
      ).status,
      413,
    );
  } finally {
    await close(gate);
    await close(upstream);
  }
});
test("review gate has a bounded upstream timeout and rejects weak configuration", async () => {
  assert.throws(() =>
    createReviewGateway({ hostname, user: "review", password: "short" }),
  );
  const upstream = http.createServer((_req, res) =>
    setTimeout(() => res.end("late"), 80),
  );
  const upstreamPort = await listen(upstream);
  const gate = createReviewGateway({
    hostname,
    user: "review",
    password,
    upstreamPort,
    timeoutMs: 20,
  });
  const port = await listen(gate);
  try {
    assert.equal((await request(port, { Authorization: auth })).status, 502);
  } finally {
    await close(gate);
    await close(upstream);
  }
});

test("HTTP review is explicit, exact-authority, authenticated and ignores spoofed proxy protocol", async () => {
  const authority = "192.168.31.195:8080";
  const upstream = http.createServer((req, res) =>
    res.end(JSON.stringify(req.headers)),
  );
  const upstreamPort = await listen(upstream);
  const gate = createReviewGateway({
    hostname: authority,
    user: "review",
    password,
    upstreamPort,
    allowHttp: true,
  });
  const port = await listen(gate);
  const base = { Host: authority, "X-Forwarded-Proto": "https" };
  try {
    assert.equal((await request(port, base, "", "/health")).status, 401);
    for (const host of [
      "192.168.31.195",
      "192.168.31.195:8081",
      "attacker.example:8080",
    ])
      assert.equal(
        (await request(port, { ...base, Host: host, Authorization: auth }))
          .status,
        421,
      );
    for (const origin of [
      "https://" + authority,
      "http://attacker.example:8080",
    ])
      assert.equal(
        (
          await request(
            port,
            { ...base, Authorization: auth, Origin: origin },
            "x",
          )
        ).status,
        403,
      );
    assert.equal(
      (await request(port, { ...base, Authorization: auth }, "x")).status,
      403,
    );
    const result = await request(
      port,
      {
        ...base,
        Authorization: auth,
        Origin: "http://" + authority,
        "X-Forwarded-Host": "attacker.example",
        Forwarded: "proto=https",
      },
      "x",
    );
    assert.equal(result.status, 200);
    const received = JSON.parse(result.data);
    assert.equal(received["x-forwarded-proto"], "http");
    assert.equal(received["x-forwarded-host"], authority);
    assert.equal(received.host, authority);
    assert.equal(received.authorization, undefined);
    assert.equal(received.forwarded, undefined);
  } finally {
    await close(gate);
    await close(upstream);
  }
});
test("HTTP mode rejects ambiguous authorities and external bind is opt-in", async () => {
  const { reviewBindAddress } = await import("./review-gateway.mjs");
  assert.equal(reviewBindAddress(), "127.0.0.1");
  assert.throws(() => reviewBindAddress("192.168.31.195"));
  assert.equal(reviewBindAddress("192.168.31.195", true), "192.168.31.195");
  assert.throws(() => reviewBindAddress("attacker.example", true));
  assert.throws(() => reviewBindAddress("0.0.0.0", true));
  assert.throws(() => reviewBindAddress("::", true));
  for (const host of [
    hostname,
    "192.168.31.195",
    "192.168.31.195:80",
    "999.1.1.1:8080",
    "192.168.31.195:08080",
  ])
    assert.throws(() =>
      createReviewGateway({
        hostname: host,
        user: "review",
        password,
        allowHttp: true,
      }),
    );
  assert.throws(() =>
    createReviewGateway({
      hostname: "192.168.31.195:8080",
      user: "review",
      password,
    }),
  );
});

test("trusted Render exposes only fixed boring readiness, all app paths remain protected", async () => {
  assert.throws(() =>
    createReviewGateway({
      hostname,
      user: "review",
      password,
      readiness: async () => true,
    }),
  );
  assert.throws(() =>
    createReviewGateway({
      hostname: "192.168.31.195:8080",
      user: "review",
      password,
      trustedRender: true,
      allowHttp: true,
    }),
  );
  const { reviewBindAddress } = await import("./review-gateway.mjs");
  assert.equal(reviewBindAddress("0.0.0.0", false, true), "0.0.0.0");
  let ready = false;
  const gate = createReviewGateway({
    hostname,
    user: "review",
    password,
    trustedRender: true,
    readiness: async () => ready,
  });
  const port = await listen(gate);
  try {
    assert.equal(
      (
        await request(
          port,
          { Host: "internal-render-probe" },
          "",
          "/_review/ready",
        )
      ).status,
      503,
    );
    ready = true;
    const result = await request(
      port,
      { Host: "internal-render-probe" },
      "",
      "/_review/ready",
    );
    assert.equal(result.status, 204);
    assert.equal(result.data, "");
    assert.equal(result.headers["cache-control"], "no-store");
    for (const path of [
      "/health",
      "/login",
      "/_review/ready?extra=1",
      "/_next/static/test.js",
    ])
      assert.equal((await request(port, {}, "", path)).status, 401);
    assert.equal((await request(port, {}, "x", "/_review/ready")).status, 401);
    assert.equal(
      (
        await request(port, {
          "X-Forwarded-Proto": "http",
          Authorization: auth,
        })
      ).status,
      308,
    );
  } finally {
    await close(gate);
  }
});
