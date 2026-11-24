import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import OpenAI from "openai";
import { z } from "zod/v3";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AssignmentSchema,
  EvaluationSchema,
  AssignmentV2Schema,
  EvaluationV2Schema,
  AI_RESERVE_CREDITS,
} from "@praktikum/types";
import { Repository } from "./repository";
import { digest, tenant } from "./auth";
import { randomUUID } from "node:crypto";
import {
  AiConfiguration,
  OPENAI_CONFIGURATION,
  DEEPSEEK_CONFIGURATION,
  aiConfiguration,
  usageCost,
} from "./ai-config";
import {
  AI_POLICY_VERSION,
  MAX_OUTPUT_TOKENS,
  MAX_REQUEST_BYTES,
  RETRY_INSTRUCTION,
  systemPrompt,
} from "./ai-prompts";
export const RESERVE = AI_RESERVE_CREDITS;
export { usageCost } from "./ai-config";
export abstract class AiProvider {
  abstract readonly configuration: AiConfiguration;
  abstract available(): boolean;
  abstract complete(
    schema: Record<string, unknown>,
    prompt: string,
    kind: string,
  ): Promise<{
    response: unknown;
    promptTokens: number;
    completionTokens: number;
    cachedPromptTokens?: number;
    responseModel?: string;
  }>;
}
export class AiProviderRejection extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("AI provider rejected request");
    this.name = "AiProviderRejection";
  }
}
export function classifyProviderRejection(
  error: unknown,
): AiProviderRejection | null {
  if (
    !(error instanceof OpenAI.APIError) ||
    !error.status ||
    ![400, 401, 403, 404, 422, 429].includes(error.status)
  )
    return null;
  const code =
    typeof error.code === "string" && /^[a-z_]{1,80}$/.test(error.code)
      ? error.code
      : "provider_rejected";
  return new AiProviderRejection(error.status, code);
}
export function completionBody(
  configuration: AiConfiguration,
  schema: Record<string, unknown>,
  prompt: string,
  kind: string,
) {
  const deepseek = configuration.provider === "deepseek";
  const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    thinking?: { type: "disabled" };
  } = {
    model: configuration.model,
    messages: [
      {
        role: "system",
        content:
          systemPrompt(kind) +
          (deepseek ? "\nJSON schema: " + JSON.stringify(schema) : ""),
      },
      { role: "user", content: prompt },
    ],
    temperature: kind === "generate" ? 0.2 : 0,
    ...(deepseek
      ? {
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: "disabled" as const },
        }
      : { max_completion_tokens: MAX_OUTPUT_TOKENS }),
    response_format: deepseek
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: { name: kind, strict: true, schema },
        },
  };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES)
    throw new UnprocessableEntityException(
      "Полный AI запрос со схемой и инструкциями превышает 200000 байт; сократите материал или ответ. Данные не обрезаются.",
    );
  return body;
}
export function parseCompletion(
  content: string | null | undefined,
  finishReason: string | null | undefined,
): unknown {
  // A syntactically complete JSON at the token boundary is still not a completed answer.
  if (finishReason !== "stop")
    return {
      invalid: content ?? null,
      finish_reason: finishReason ?? "missing",
    };
  try {
    return JSON.parse(content ?? "null") as unknown;
  } catch {
    return { invalid: content ?? null, finish_reason: finishReason };
  }
}
async function completion(
  configuration: AiConfiguration,
  schema: Record<string, unknown>,
  prompt: string,
  kind: string,
) {
  const deepseek = configuration.provider === "deepseek";
  const client = new OpenAI({
    apiKey: deepseek
      ? process.env.DEEPSEEK_API_KEY
      : process.env.OPENAI_API_KEY,
    ...(deepseek ? { baseURL: "https://api.deepseek.com" } : {}),
    maxRetries: 0,
    timeout: 45000,
  });
  const body = completionBody(configuration, schema, prompt, kind);
  const r = await client.chat.completions
    .create(body)
    .catch((error: unknown) => {
      throw classifyProviderRejection(error) ?? error;
    });
  if (!r.usage) throw new Error("AI usage missing; reconciliation required");
  const usage = r.usage as typeof r.usage & {
    prompt_cache_hit_tokens?: number;
    cached_tokens?: number;
  };
  const cachedPromptTokens =
    usage.prompt_cache_hit_tokens ??
    usage.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    0;
  usageCost(
    usage.prompt_tokens,
    usage.completion_tokens,
    cachedPromptTokens,
    configuration,
  );
  const response = parseCompletion(
    r.choices[0]?.message.content,
    r.choices[0]?.finish_reason,
  );
  return {
    response,
    responseModel: r.model,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    cachedPromptTokens,
  };
}
@Injectable()
export class OpenAiProvider extends AiProvider {
  readonly configuration = OPENAI_CONFIGURATION;
  available() {
    return !!process.env.OPENAI_API_KEY;
  }
  complete(schema: Record<string, unknown>, prompt: string, kind: string) {
    return completion(this.configuration, schema, prompt, kind);
  }
}
@Injectable()
export class DeepSeekProvider extends AiProvider {
  readonly configuration = DEEPSEEK_CONFIGURATION;
  available() {
    return !!process.env.DEEPSEEK_API_KEY;
  }
  complete(schema: Record<string, unknown>, prompt: string, kind: string) {
    return completion(this.configuration, schema, prompt, kind);
  }
}
export function configuredAiProvider(): AiProvider {
  return aiConfiguration().provider === "deepseek"
    ? new DeepSeekProvider()
    : new OpenAiProvider();
}
export class AiStructuredOutputError extends UnprocessableEntityException {
  constructor() {
    super(
      "AiStructuredOutputError: ответ AI не прошёл grounding/schema после 3 попыток",
    );
  }
}
export function validateGrounded(
  kind: string,
  data: unknown,
  source: string,
  criteria: unknown,
  context?: {
    answer?: unknown;
    question?: unknown;
    assessment_mode?: unknown;
    version?: number;
  },
) {
  const v2 = context?.version === 2;
  const schema =
    kind === "generate"
      ? v2
        ? AssignmentV2Schema
        : AssignmentSchema
      : v2
        ? EvaluationV2Schema
        : EvaluationSchema;
  const r = schema.safeParse(data);
  if (!r.success) return false;
  const result = r.data;
  if (result.evidence.some((q) => !q.trim() || !source.includes(q)))
    return false;
  if (v2 && kind === "generate") {
    const result = AssignmentV2Schema.parse(data);
    if (
      new Set(result.assessment.map((r) => r.id)).size !==
      result.assessment.length
    )
      return false;
    if (new Set(result.assessment.map((r) => r.criterion)).size !== 3)
      return false;
    if (
      result.assessment.some(
        (r) =>
          !source.includes(r.source_quote) ||
          !result.question.includes(r.question_quote),
      )
    )
      return false;
  }
  if (v2 && kind === "evaluate") {
    const result = EvaluationV2Schema.parse(data);
    const assignment = AssignmentV2Schema.safeParse(context?.question);
    if (assignment.success) {
      if (
        result.assessment_mode !== "snapshot" ||
        result.checks.length !== assignment.data.assessment.length
      )
        return false;
      const ids = new Set(assignment.data.assessment.map((r) => r.id));
      if (new Set(result.checks.map((r) => r.rule_id)).size !== ids.size)
        return false;
      const answer = typeof context?.answer === "string" ? context.answer : "";
      if (
        result.checks.some(
          (c) =>
            !ids.has(c.rule_id) ||
            (c.status === "missing"
              ? c.answer_quotes.length !== 0
              : c.answer_quotes.length === 0) ||
            c.answer_quotes.some((q) => !answer.includes(q)),
        )
      )
        return false;
    } else if (
      result.assessment_mode !== "legacy_question" ||
      result.checks.length !== 0
    )
      return false;
    if (result.assessment_mode !== context?.assessment_mode) return false;
  }
  if ("score" in result) {
    if (result.score > 0 && !result.evidence.length) return false;
    const expected = z
      .array(z.object({ id: z.string(), max: z.number() }))
      .parse(criteria);
    if (
      result.criteria.length !== expected.length ||
      new Set(result.criteria.map((c) => c.id)).size !== expected.length
    )
      return false;
    for (const c of expected) {
      const score = result.criteria.find((x) => x.id === c.id)?.score;
      if (score === undefined || score > c.max) return false;
    }
    if (result.criteria.reduce((s, c) => s + c.score, 0) !== result.score)
      return false;
  }
  return true;
}
@Injectable()
export class AiService {
  constructor(
    @Inject(Repository) private db: Repository,
    @Inject(AiProvider) private provider: AiProvider,
  ) {}
  async run(
    u: User,
    kind: "generate" | "evaluate",
    input: { source: string; criteria: unknown; [key: string]: unknown },
  ) {
    if (kind === "evaluate") {
      if (!AssignmentV2Schema.safeParse(input.question).success)
        throw new ConflictException(
          "Это задание использует предыдущую методику. Попросите владельца или руководителя обновить задание по материалу; прежние ответы сохранятся.",
        );
      input = { ...input, assessment_mode: "snapshot" };
    }
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 200000)
      throw new UnprocessableEntityException(
        "AI вход превышает 200000 байт; материал не обрезается молча",
      );
    const schema =
      kind === "generate" ? AssignmentV2Schema : EvaluationV2Schema;
    const jsonSchema = zodToJsonSchema(schema, {
      target: "openAi",
      $refStrategy: "none",
    }) as Record<string, unknown>;
    // Validate the largest (retry) complete request before reserving money or creating an operation.
    completionBody(
      this.provider.configuration,
      jsonSchema,
      JSON.stringify(input) + RETRY_INSTRUCTION,
      kind,
    );
    const companyId = tenant(u),
      hash = digest(
        JSON.stringify({
          companyId,
          userId: u.id,
          kind,
          input,
          provider: this.provider.configuration.provider,
          model: this.provider.configuration.model,
          tariffVersion: this.provider.configuration.tariffVersion,
          version: AI_POLICY_VERSION,
        }),
      );
    const existing = await this.db.aiOperation.findUnique({
      where: { requestHash: hash },
    });
    if (existing) {
      if (existing.status === "SUCCESS") return existing;
      if (existing.status === "PENDING" || existing.status === "UNKNOWN")
        throw new ConflictException(
          "AI операция уже выполняется или требует сверки",
        );
      if (existing.status !== "REJECTED") throw new AiStructuredOutputError();
    }
    if (!this.provider.available())
      throw new ServiceUnavailableException(
        "API ключ выбранного AI провайдера не настроен. Реальный AI недоступен.",
      );
    let operation;
    const reservationId = randomUUID();
    const previousCost = existing?.cost ?? 0;
    try {
      operation = await this.db.$transaction(async (tx) => {
        const company = await tx.company.updateMany({
          where: { id: companyId, balance: { gte: RESERVE } },
          data: { balance: { decrement: RESERVE } },
        });
        if (!company.count)
          throw new UnprocessableEntityException(
            "Недостаточно кредитов: резерв 200000",
          );
        const user = await tx.user.updateMany({
          where: {
            id: u.id,
            companyId,
            spent: { lte: u.limit - RESERVE },
            limit: u.limit,
          },
          data: { spent: { increment: RESERVE } },
        });
        if (!user.count)
          throw new UnprocessableEntityException(
            "Лимит пользователя исчерпан или изменён",
          );
        if (
          existing &&
          !(
            await tx.aiOperation.updateMany({
              where: {
                id: existing.id,
                status: "REJECTED",
                revision: existing.revision,
              },
              data: {
                status: "PENDING",
                result: Prisma.DbNull,
                revision: { increment: 1 },
              },
            })
          ).count
        )
          throw new ConflictException("AI операция уже выполняется");
        const op = existing
          ? await tx.aiOperation.findUniqueOrThrow({
              where: { id: existing.id },
            })
          : await tx.aiOperation.create({
              data: {
                companyId,
                userId: u.id,
                requestHash: hash,
                kind,
                reserved: RESERVE,
              },
            });
        await tx.creditTransaction.create({
          data: {
            companyId,
            userId: u.id,
            amount: -RESERVE,
            kind: "RESERVE",
            key: `reserve:${op.id}:${reservationId}`,
          },
        });
        return op;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new ConflictException("Дублирующая AI операция");
      throw e;
    }
    let cost = 0,
      result: unknown = null,
      valid = false,
      unknown = false;
    let rejection: AiProviderRejection | null = null;
    for (let retry = 0; retry < 3; retry++) {
      const start = Date.now();
      try {
        const r = await this.provider.complete(
          jsonSchema,
          JSON.stringify(input) + (retry ? RETRY_INSTRUCTION : ""),
          kind,
        );
        const callCost = usageCost(
          r.promptTokens,
          r.completionTokens,
          r.cachedPromptTokens ?? 0,
          this.provider.configuration,
        );
        cost += callCost;
        valid = validateGrounded(
          kind,
          r.response,
          input.source,
          input.criteria,
          { ...input, version: 2 },
        );
        await this.db.aiCall.create({
          data: {
            companyId,
            operationId: operation.id,
            model: this.provider.configuration.model,
            provider: this.provider.configuration.provider,
            tariffVersion: this.provider.configuration.tariffVersion,
            promptTokens: r.promptTokens,
            completionTokens: r.completionTokens,
            cachedPromptTokens: r.cachedPromptTokens ?? 0,
            responseModel: r.responseModel ?? null,
            cost: callCost,
            latencyMs: Date.now() - start,
            requestHash: hash,
            responseJson:
              r.response === null
                ? Prisma.JsonNull
                : (r.response as Prisma.InputJsonValue),
            validationStatus: valid ? "VALID" : "INVALID",
          },
        });
        if (valid) {
          result = r.response;
          break;
        }
      } catch (e) {
        rejection = e instanceof AiProviderRejection ? e : null;
        unknown = !rejection;
        await this.db.aiCall.create({
          data: {
            companyId,
            operationId: operation.id,
            model: this.provider.configuration.model,
            provider: this.provider.configuration.provider,
            tariffVersion: this.provider.configuration.tariffVersion,
            promptTokens: 0,
            completionTokens: 0,
            cost: 0,
            latencyMs: Date.now() - start,
            requestHash: hash,
            responseJson: rejection
              ? { status: rejection.status, code: rejection.code }
              : { error: e instanceof Error ? e.name : "Unknown" },
            validationStatus: rejection ? "PROVIDER_REJECTED" : "USAGE_UNKNOWN",
          },
        });
        break;
      }
    }
    if (unknown) {
      await this.db.aiOperation.update({
        where: { id: operation.id },
        data: { status: "UNKNOWN", cost: previousCost + cost },
      });
      throw new ServiceUnavailableException(
        "Исход запроса AI неизвестен; резерв удержан до сверки. Повторный вызов заблокирован.",
      );
    }
    const settled = await this.db.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { balance: { increment: RESERVE - cost } },
      });
      await tx.user.update({
        where: { id: u.id },
        data: { spent: { decrement: RESERVE - cost } },
      });
      await tx.creditTransaction.create({
        data: {
          companyId,
          userId: u.id,
          amount: RESERVE - cost,
          kind: "AI_SETTLEMENT",
          key: `settle:${operation.id}:${reservationId}`,
        },
      });
      return tx.aiOperation.update({
        where: { id: operation.id },
        data: {
          status: valid ? "SUCCESS" : rejection ? "REJECTED" : "FAILED",
          cost: previousCost + cost,
          result:
            result === null ? Prisma.DbNull : (result as Prisma.InputJsonValue),
        },
      });
    });
    if (rejection)
      throw new ServiceUnavailableException(
        `AI провайдер отклонил запрос (${rejection.status}, ${rejection.code}); неиспользованный резерв возвращён.`,
      );
    if (!valid) throw new AiStructuredOutputError();
    return settled;
  }
}
