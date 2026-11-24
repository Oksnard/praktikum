import "reflect-metadata";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { EvaluationSchema, criteria } from "@praktikum/types";
import { AiService, configuredAiProvider, validateGrounded } from "../src/ai";
import { Repository } from "../src/repository";
const live = process.argv.includes("--live");
async function main() {
  if (live && !configuredAiProvider().available())
    throw new Error(
      "Selected AI provider API key required; no live calls made",
    );
  const db = new Repository();
  try {
    const user = live
      ? await db.user.findUniqueOrThrow({
          where: { email: "employee@alpha.test" },
        })
      : null;
    for (const file of await readdir("evals/fixtures")) {
      const f = JSON.parse(
        await readFile(`evals/fixtures/${file}`, "utf8"),
      ) as {
        material: string;
        answer: string;
        expectedScoreRange: [number, number];
        response: unknown;
      };
      const response = live
        ? (
            await new AiService(db, configuredAiProvider()).run(
              user!,
              "evaluate",
              { source: f.material, criteria, answer: f.answer, fixture: file },
            )
          ).result
        : f.response;
      const parsed = EvaluationSchema.parse(response);
      assert.ok(validateGrounded("evaluate", parsed, f.material, criteria));
      assert.ok(
        parsed.score >= f.expectedScoreRange[0] &&
          parsed.score <= f.expectedScoreRange[1],
        `${file}: score ${parsed.score}`,
      );
      console.log(
        `${file}: score=${parsed.score}, evidence=${parsed.evidence.length}, mode=${live ? "LIVE" : "recorded snapshot"}`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
