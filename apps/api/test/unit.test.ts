import OpenAI from "openai";
import { test } from "node:test";
import assert from "node:assert/strict";
import { criteria, EvaluationSchema } from "@praktikum/types";
import {
  usageCost,
  validateGrounded,
  classifyProviderRejection,
} from "../src/ai";
import { hashPassword, verifyPassword } from "../src/auth";
import { evaluation, source } from "./fixtures";
test("usage pricing rounds up microUSD from actual token counts", () => {
  assert.equal(usageCost(1000, 200), 270);
  assert.equal(usageCost(1, 0), 1);
  assert.equal(usageCost(0, 0), 0);
  assert.equal(usageCost(1_000_000, 1_000_000), 750_000);
});
test("password hashing salts and verifies without plaintext", () => {
  const h = hashPassword("correct password");
  assert.ok(verifyPassword("correct password", h));
  assert.ok(!verifyPassword("incorrect password", h));
  assert.notEqual(h, hashPassword("correct password"));
});
test("grounding rejects invented, empty evidence and mismatched criteria totals", () => {
  assert.ok(validateGrounded("evaluate", evaluation(), source, criteria));
  assert.ok(
    !validateGrounded(
      "evaluate",
      { ...evaluation(), evidence: [] },
      source,
      criteria,
    ),
  );
  assert.ok(
    !validateGrounded(
      "evaluate",
      { ...evaluation(), evidence: ["invented"] },
      source,
      criteria,
    ),
  );
  assert.ok(
    !validateGrounded(
      "evaluate",
      { ...evaluation(), score: 99 },
      source,
      criteria,
    ),
  );
  assert.ok(
    !validateGrounded(
      "evaluate",
      { ...evaluation(), criteria: [evaluation().criteria[0]] },
      source,
      criteria,
    ),
  );
  assert.ok(
    !validateGrounded(
      "evaluate",
      { ...evaluation(), evidence: [""] },
      source,
      criteria,
    ),
  );
  assert.ok(validateGrounded("evaluate", evaluation(0), source, criteria));
});
test("strict shape rejects unknown fields and out of range scores", () => {
  assert.ok(
    !EvaluationSchema.safeParse({ ...evaluation(), score: 101 }).success,
  );
  assert.ok(
    !EvaluationSchema.safeParse({ ...evaluation(), extra: "field" }).success,
  );
});

test("provider rejections expose only safe status/code and keep uncertain outcomes unknown", () => {
  const denied = new OpenAI.APIError(
    429,
    { code: "credit_balance_exhausted" },
    "sensitive provider message",
    new Headers(),
  );
  const safe = classifyProviderRejection(denied);
  assert.equal(safe?.status, 429);
  assert.equal(safe?.code, "credit_balance_exhausted");
  assert.ok(!JSON.stringify(safe).includes("sensitive"));
  assert.equal(
    classifyProviderRejection(
      new OpenAI.APIError(500, {}, "unknown", new Headers()),
    ),
    null,
  );
  assert.equal(classifyProviderRejection(new Error("network unknown")), null);
  const unsafeCode = new OpenAI.APIError(
    401,
    { code: "credential-with-untrusted-content" },
    "sensitive",
    new Headers(),
  );
  assert.equal(
    classifyProviderRejection(unsafeCode)?.code,
    "provider_rejected",
  );
});
