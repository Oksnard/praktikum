import { OPENAI_CONFIGURATION } from "../src/ai-config";
import { AiProvider, AiProviderRejection } from "../src/ai";
import { AssignmentV2Schema, Evaluation } from "@praktikum/types";
export const source =
  "Сотрудник регистрирует обращение в CRM. Подтверждение получения отправляется в течение двух часов. Если решение занимает более одного рабочего дня, обращение передаётся руководителю. Возврат средств требует согласования руководителя.";
export function evaluation(score = 100): Evaluation {
  const scores =
    score === 100 ? [40, 30, 30] : score === 50 ? [20, 15, 15] : [0, 0, 0];
  return {
    score,
    criteria: ["accuracy", "completeness", "application"].map((id, i) => ({
      id,
      score: scores[i],
      explanation: score ? "Проверено по инструкции" : "Действие не раскрыто",
    })),
    evidence: score ? ["Сотрудник регистрирует обращение в CRM."] : [],
    unsupported_claims: score
      ? []
      : ["Утверждение не подтверждено инструкцией"],
    gaps: score === 100 ? [] : ["Нужно раскрыть порядок эскалации"],
    feedback: "Сопоставьте порядок действий с инструкцией.",
    recommendations: ["Повторите порядок регистрации и эскалации обращения."],
    personal_material:
      "Зарегистрируйте обращение в CRM. Подтвердите получение за два часа. Решение дольше рабочего дня — передайте руководителю.",
  };
}
export class FixtureProvider extends AiProvider {
  readonly configuration = OPENAI_CONFIGURATION;
  calls = 0;
  responses: unknown[] = [];
  fail = false;
  reject = false;
  delay = 0;
  available() {
    return true;
  }
  async complete(
    _schema: Record<string, unknown>,
    prompt: string,
    kind: string,
  ) {
    this.calls++;
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
    if (this.reject)
      throw new AiProviderRejection(429, "credit_balance_exhausted");
    if (this.responses[0] instanceof AiProviderRejection)
      throw this.responses.shift();
    if (this.fail) throw new Error("NetworkOutcomeUnknown");
    const input = JSON.parse(prompt.split("\nПредыдущая")[0]) as {
      source: string;
      question?: unknown;
      answer?: string;
      assessment_mode?: string;
    };
    return {
      response: this.responses.length
        ? this.responses.shift()
        : kind === "generate"
          ? {
              version: 2,
              assessment: ["accuracy", "completeness", "application"].map(
                (criterion) => ({
                  id: criterion,
                  criterion,
                  requirement: "Опишите действие по источнику",
                  source_quote: input.source.split(". ")[0] + ".",
                  question_quote: "Опишите ваши действия.",
                }),
              ),
              summary: "Порядок работы с клиентом",
              question:
                "Клиент ожидает решение два дня. Опишите ваши действия.",
              evidence: [input.source.split(". ")[0] + "."],
            }
          : {
              ...evaluation(),
              version: 2,
              assessment_mode: input.assessment_mode ?? "legacy_question",
              checks: AssignmentV2Schema.safeParse(input.question).success
                ? AssignmentV2Schema.parse(input.question).assessment.map(
                    (r) => ({
                      rule_id: r.id,
                      status: "met",
                      answer_quotes: [input.answer!],
                      explanation: "DI fixture, not a semantic assessment",
                    }),
                  )
                : [],
            },
      promptTokens: 1000,
      completionTokens: 200,
    };
  }
}
