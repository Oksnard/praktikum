import { AiProvider, AiProviderRejection } from "../src/ai";
import { Evaluation } from "@praktikum/types";
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
    };
    return {
      response: this.responses.length
        ? this.responses.shift()
        : kind === "generate"
          ? {
              summary: "Порядок работы с клиентом",
              question:
                "Клиент ожидает решение два дня. Опишите ваши действия.",
              evidence: [input.source.split(". ")[0] + "."],
            }
          : evaluation(),
      promptTokens: 1000,
      completionTokens: 200,
    };
  }
}
