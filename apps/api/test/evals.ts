import "reflect-metadata";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  EvaluationSchema,
  EvaluationV2Schema,
  AssignmentV2Schema,
  criteria,
} from "@praktikum/types";
import { AiService, configuredAiProvider, validateGrounded } from "../src/ai";
import { Repository } from "../src/repository";
async function main() {
  const live = process.argv.includes("--live");
  const db = live ? new Repository() : null;
  try {
    const user = db
      ? await db.user.findUniqueOrThrow({
          where: {
            id: process.env.EVAL_QA_USER_ID ?? "missing-explicit-qa-user",
          },
        })
      : null;
    const company =
      db && user?.companyId
        ? await db.company.findUnique({ where: { id: user.companyId } })
        : null;
    if (live) {
      assert.ok(
        user &&
          user.companyId === process.env.EVAL_QA_COMPANY_ID &&
          company?.name.startsWith("QA-AI-QUALITY-") &&
          user.role === "EMPLOYEE",
        "Live evals require explicit EVAL_QA_USER_ID/EVAL_QA_COMPANY_ID for a dedicated QA tenant",
      );
      assert.ok(
        configuredAiProvider().available(),
        "Selected provider key required; no fallback",
      );
    }
    for (const file of live ? [] : await readdir("evals/fixtures")) {
      const f = JSON.parse(
        await readFile(`evals/fixtures/${file}`, "utf8"),
      ) as {
        material: string;
        expectedScoreRange: [number, number];
        response: unknown;
      };
      const parsed = EvaluationSchema.parse(f.response);
      assert.ok(validateGrounded("evaluate", parsed, f.material, criteria));
      assert.ok(
        parsed.score >= f.expectedScoreRange[0] &&
          parsed.score <= f.expectedScoreRange[1],
        `${file}: score ${parsed.score}`,
      );
      console.log(
        `${file}: score=${parsed.score}, evidence=${parsed.evidence.length}, mode=historical recorded snapshot`,
      );
    }
    for (const file of await readdir("evals/task-aware-recordings")) {
      const f = JSON.parse(
        await readFile(`evals/task-aware-recordings/${file}`, "utf8"),
      ) as {
        source: string;
        assignment: unknown;
        answer: string;
        expectedScoreRange: [number, number];
        response: unknown;
      };
      const assignment = AssignmentV2Schema.parse(f.assignment);
      const response =
        live && db && user
          ? (
              await new AiService(db, configuredAiProvider()).run(
                user,
                "evaluate",
                {
                  source: f.source,
                  criteria,
                  question: assignment,
                  answer: f.answer,
                  fixture: file,
                },
              )
            ).result
          : f.response;
      const parsed = EvaluationV2Schema.parse(response);
      assert.ok(
        validateGrounded("generate", assignment, f.source, criteria, {
          version: 2,
        }),
      );
      assert.ok(
        validateGrounded("evaluate", parsed, f.source, criteria, {
          version: 2,
          question: assignment,
          answer: f.answer,
          assessment_mode: "snapshot",
        }),
      );
      assert.ok(
        parsed.score >= f.expectedScoreRange[0] &&
          parsed.score <= f.expectedScoreRange[1],
        `${file}: score ${parsed.score}`,
      );
      console.log(
        `v2/${file}: score=${parsed.score}, checks=${parsed.checks.length}, mode=${live ? "LIVE current policy" : "policy5 recorded snapshot"}`,
      );
    }
  } finally {
    await db?.$disconnect();
  }
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
