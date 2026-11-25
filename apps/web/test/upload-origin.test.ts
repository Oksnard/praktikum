import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadOriginAllowed } from "../src/lib/upload-origin";
test("public upload origin survives internal Next bind URL and rejects forged forwarding", () => {
  const origin = "https://private-review.trycloudflare.com";
  const request = (value: string) =>
    new Request("https://127.0.0.1:3300/api/materials/upload", {
      headers: {
        Host: "private-review.trycloudflare.com",
        Origin: value,
        "X-Forwarded-Host": "attacker.example",
        "X-Forwarded-Proto": "https",
      },
    });
  assert.equal(uploadOriginAllowed(request(origin), origin), true);
  assert.equal(
    uploadOriginAllowed(request("https://attacker.example"), origin),
    false,
  );
  assert.equal(uploadOriginAllowed(request("https://attacker.example")), false);
  assert.equal(
    uploadOriginAllowed(request(origin), origin + "/untrusted-path"),
    false,
  );
  assert.equal(
    uploadOriginAllowed(
      new Request("http://localhost:3200/api/materials/upload", {
        headers: { Host: "127.0.0.1:3200", Origin: "http://127.0.0.1:3200" },
      }),
    ),
    true,
  );
  assert.equal(
    uploadOriginAllowed(
      new Request("http://localhost:3000/api/materials/upload", {
        headers: { Origin: "http://localhost:3000" },
      }),
    ),
    true,
  );
});

test("explicit HTTP IP upload origin is supported without trusting forwarded headers", () => {
  const origin = "http://192.168.31.195:8080";
  const request = (value: string) =>
    new Request("http://127.0.0.1:8081/api/materials/upload", {
      headers: {
        Host: "192.168.31.195:8080",
        Origin: value,
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "attacker.example",
      },
    });
  assert.equal(uploadOriginAllowed(request(origin), origin), true);
  assert.equal(
    uploadOriginAllowed(request("http://192.168.31.195:8081"), origin),
    false,
  );
  assert.equal(
    uploadOriginAllowed(request("https://192.168.31.195:8080"), origin),
    false,
  );
});
