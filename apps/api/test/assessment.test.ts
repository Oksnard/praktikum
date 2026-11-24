import { test } from "node:test";
import assert from "node:assert/strict";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AssignmentV2Schema,
  EvaluationV2Schema,
  StoredAssignmentSchema,
  StoredEvaluationSchema,
  criteria,
  AI_RESERVE_CREDITS,
} from "@praktikum/types";
import { completionBody, parseCompletion, validateGrounded } from "../src/ai";
import {
  DEEPSEEK_CONFIGURATION,
  OPENAI_CONFIGURATION,
  usageCost,
} from "../src/ai-config";
import {
  MAX_REQUEST_BYTES,
  MAX_OUTPUT_TOKENS,
  TOKEN_FRAMING_ALLOWANCE,
  RETRY_INSTRUCTION,
} from "../src/ai-prompts";
import {
  assessmentCases,
  authoredAssignment,
  authoredEvaluation,
} from "./assessment-cases";
import { evaluation } from "./fixtures";
for (const f of assessmentCases) {
  test(`authored ${f.domain}: schema accepts relevant alternative plan and exact evidence; rejects fabricated evidence/rules`, () => {
    const assignment = authoredAssignment(f),
      response = authoredEvaluation(f);
    const context = {
      version: 2,
      question: assignment,
      answer: f.answer,
      assessment_mode: "snapshot",
    };
    assert.ok(
      validateGrounded("generate", assignment, f.source, criteria, {
        version: 2,
      }),
    );
    assert.ok(
      validateGrounded("evaluate", response, f.source, criteria, context),
    );
    for (const mutation of [
      { ...response, checks: response.checks.slice(1) },
      {
        ...response,
        checks: response.checks.map((c) => ({ ...c, rule_id: "invented" })),
      },
      {
        ...response,
        checks: response.checks.map((c) => ({
          ...c,
          answer_quotes: ["Выдуманная цитата"],
        })),
      },
      {
        ...response,
        checks: response.checks.map((c) => ({ ...c, status: "missing" })),
      },
      { ...response, score: 99 },
      { ...response, assessment_mode: "legacy_question", checks: [] },
    ])
      assert.equal(
        validateGrounded("evaluate", mutation, f.source, criteria, context),
        false,
      );
    assert.equal(
      validateGrounded(
        "generate",
        {
          ...assignment,
          assessment: assignment.assessment.map((r) => ({
            ...r,
            source_quote: "Новая обязанность без источника",
          })),
        },
        f.source,
        criteria,
        { version: 2 },
      ),
      false,
    );
    assert.equal(
      validateGrounded(
        "generate",
        {
          ...assignment,
          assessment: assignment.assessment.map((r) => ({
            ...r,
            question_quote: "Другой вопрос",
          })),
        },
        f.source,
        criteria,
        { version: 2 },
      ),
      false,
    );
  });
}
test("v1 remains readable but cannot pass a new v2 operation; legacy assignment mode is explicit", () => {
  const f = assessmentCases[0];
  const oldAssignment = {
    summary: f.source,
    question: f.question,
    evidence: [f.requirements[0][2]],
  };
  assert.ok(StoredAssignmentSchema.safeParse(oldAssignment).success);
  assert.ok(StoredEvaluationSchema.safeParse(evaluation()).success);
  assert.equal(
    validateGrounded("generate", oldAssignment, f.source, criteria, {
      version: 2,
    }),
    false,
  );
  const result = {
    ...authoredEvaluation(f),
    assessment_mode: "legacy_question",
    checks: [],
  };
  assert.ok(
    validateGrounded("evaluate", result, f.source, criteria, {
      version: 2,
      question: oldAssignment,
      assessment_mode: "legacy_question",
    }),
  );
});
test("length/refusal/malformed JSON cannot become a report, including syntactically complete JSON at length boundary", () => {
  for (const reason of ["length", "content_filter", null, "tool_calls"])
    assert.ok(
      !EvaluationV2Schema.safeParse(
        parseCompletion(
          JSON.stringify(authoredEvaluation(assessmentCases[0])),
          reason,
        ),
      ).success,
    );
  assert.ok(
    !EvaluationV2Schema.safeParse(parseCompletion('{"score":', "stop")).success,
  );
  assert.ok(
    EvaluationV2Schema.safeParse(
      parseCompletion(
        JSON.stringify(authoredEvaluation(assessmentCases[0])),
        "stop",
      ),
    ).success,
  );
});
test("full request includes schema, policy and retry; cap plus framing and three max outputs fits reserve", () => {
  for (const config of [DEEPSEEK_CONFIGURATION, OPENAI_CONFIGURATION]) {
    for (const [kind, schema] of [
      ["generate", AssignmentV2Schema],
      ["evaluate", EvaluationV2Schema],
    ] as const) {
      const jsonSchema = zodToJsonSchema(schema, {
        target: "openAi",
        $refStrategy: "none",
      }) as Record<string, unknown>;
      const base = completionBody(config, jsonSchema, RETRY_INSTRUCTION, kind);
      const overhead = Buffer.byteLength(JSON.stringify(base));
      const largest = completionBody(
        config,
        jsonSchema,
        "x".repeat(MAX_REQUEST_BYTES - overhead) + RETRY_INSTRUCTION,
        kind,
      );
      assert.equal(
        Buffer.byteLength(JSON.stringify(largest)),
        MAX_REQUEST_BYTES,
      );
      assert.throws(() =>
        completionBody(
          config,
          jsonSchema,
          "x".repeat(MAX_REQUEST_BYTES - overhead + 1) + RETRY_INSTRUCTION,
          kind,
        ),
      );
      assert.ok(
        3 *
          usageCost(
            MAX_REQUEST_BYTES + TOKEN_FRAMING_ALLOWANCE,
            MAX_OUTPUT_TOKENS,
            0,
            config,
          ) <=
          AI_RESERVE_CREDITS,
      );
      assert.ok(JSON.stringify(base).includes("JSON"));
      assert.equal(
        config.provider === "deepseek"
          ? base.max_tokens
          : base.max_completion_tokens,
        4096,
      );
    }
  }
  assert.equal(3 * usageCost(201024, 4096, 0, DEEPSEEK_CONFIGURATION), 195669);
});
