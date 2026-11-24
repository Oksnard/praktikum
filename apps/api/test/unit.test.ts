import { test } from "node:test";
import assert from "node:assert/strict";
import { criteria, EvaluationSchema } from "@praktikum/types";
import { usageCost, validateGrounded } from "../src/ai";
import { hashPassword, verifyPassword } from "../src/auth";
import { evaluation, source } from "./fixtures";
test("usage pricing rounds up microUSD from actual token counts", () => {
  assert.equal(usageCost(1000, 200), 270);
  assert.equal(usageCost(1, 0), 1);
  assert.equal(usageCost(0, 0), 0);
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
