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
