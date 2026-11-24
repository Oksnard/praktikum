import { productionPolicy } from "../src/production-policy";
import { DEEPSEEK_CONFIGURATION, OPENAI_CONFIGURATION } from "../src/ai-config";
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

test("DeepSeek internal peak tariff accounts for actual cache hits and rounds once per call", () => {
  assert.equal(
    usageCost(1_000_000, 1_000_000, 0, DEEPSEEK_CONFIGURATION),
    1_500_000,
  );
  assert.equal(
    usageCost(1_000_000, 0, 1_000_000, DEEPSEEK_CONFIGURATION),
    6_000,
  );
  assert.equal(usageCost(1000, 200, 500, DEEPSEEK_CONFIGURATION), 393);
  assert.equal(usageCost(1000, 0, 1000, OPENAI_CONFIGURATION), 75);
  assert.throws(() => usageCost(1, 0, 2, DEEPSEEK_CONFIGURATION));
});

test("public deployment denies signup and mock money by default without changing local demo", () => {
  assert.deepEqual(productionPolicy({ NODE_ENV: "production" }), {
    allowRegistration: false,
    allowMockTopUps: false,
  });
  assert.deepEqual(productionPolicy({ NODE_ENV: "development" }), {
    allowRegistration: true,
    allowMockTopUps: true,
  });
  assert.equal(
    productionPolicy({
      NODE_ENV: "production",
      ALLOW_PUBLIC_REGISTRATION: "true",
    }).allowRegistration,
    true,
  );
  assert.equal(
    productionPolicy({ NODE_ENV: "development", ALLOW_MOCK_TOPUPS: "false" })
      .allowMockTopUps,
    false,
  );
});

test("mandatory AI learning and feedback strings cannot be blank or whitespace", () => {
  assert.ok(
    !validateGrounded(
      "generate",
      { summary: "", question: " ", evidence: [source.split(". ")[0] + "."] },
      source,
      criteria,
    ),
  );
  const blank = {
    ...evaluation(),
    feedback: " ",
    personal_material: "",
    recommendations: [""],
    criteria: evaluation().criteria.map((c) => ({ ...c, explanation: "" })),
  };
  assert.ok(!validateGrounded("evaluate", blank, source, criteria));
});
