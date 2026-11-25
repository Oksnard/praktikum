import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookieOptions } from "../src/lib/session-cookie";
const origin = "http://192.168.31.195:8080";
const headers = new Headers({
  host: "192.168.31.195:8080",
  origin,
  "x-forwarded-proto": "http",
});
test("production cookies stay Secure regardless of forwarded headers or HTTP origin", () => {
  assert.deepEqual(
    sessionCookieOptions(
      { NODE_ENV: "production", PUBLIC_ORIGIN: origin },
      headers,
    ),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 1209600,
    },
  );
  assert.equal(
    sessionCookieOptions({ NODE_ENV: "development" }, headers).secure,
    false,
  );
});
test("HTTP cookie opt-in requires exact server-owned IPv4 origin and actual request host/origin", () => {
  const env = {
    NODE_ENV: "production",
    PUBLIC_ORIGIN: origin,
    REVIEW_ALLOW_HTTP_COOKIE: "true",
  };
  assert.equal(sessionCookieOptions(env, headers).secure, false);
  const invalidHeaders: Record<string, string>[] = [
    { host: "192.168.31.195", origin },
    {
      host: "attacker.example",
      origin,
      "x-forwarded-host": "192.168.31.195:8080",
    },
    { host: "192.168.31.195:8080", origin: "https://192.168.31.195:8080" },
    { host: "192.168.31.195:8080" },
  ];
  for (const changed of invalidHeaders)
    assert.throws(() => sessionCookieOptions(env, new Headers(changed)));
  for (const invalid of [
    undefined,
    "https://review.example",
    origin + "/",
    "http://review.example:8080",
    "http://999.1.1.1:8080",
    "http://192.168.31.195:80",
  ])
    assert.throws(() =>
      sessionCookieOptions({ ...env, PUBLIC_ORIGIN: invalid }, headers),
    );
});
