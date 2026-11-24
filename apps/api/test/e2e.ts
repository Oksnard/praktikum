import { Prisma } from "@prisma/client";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/module";
import { AiProvider, AiProviderRejection, AiService, RESERVE } from "../src/ai";
import { Repository } from "../src/repository";
import { FixtureProvider, evaluation, source } from "./fixtures";
const provider = new FixtureProvider();
let app: INestApplication;
let base = "";
async function req(path: string, token = "", body?: unknown, method = "POST") {
  const r = await fetch(base + path, {
    method: body === undefined && method === "POST" ? "GET" : method,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: (await r.json()) as Record<string, unknown>,
  };
}
async function main() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiProvider)
    .useValue(provider)
    .compile();
  app = module.createNestApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const db = app.get(Repository);
  const run = randomUUID().slice(0, 8);
  const email = (x: string) => `${run}-${x}@e2e.test`;
  let companyId = "";
  let bId = "";
  try {
    const ownerR = await req("/auth/register", "", {
      email: email("owner"),
      password: "LongPassword123!",
      name: "Тест владелец",
      companyName: `E2E ${run}`,
    });
    assert.equal(ownerR.status, 201);
    const owner = ownerR.data.token as string;
    companyId = (ownerR.data.user as { companyId: string }).companyId;
    const other = await req("/auth/register", "", {
      email: email("other"),
      password: "LongPassword123!",
      name: "Другой",
      companyName: `Other ${run}`,
    });
    const otherToken = other.data.token as string;
    bId = (other.data.user as { companyId: string }).companyId;
    const employeeR = await req("/users", owner, {
      email: email("employee"),
      password: "LongPassword123!",
      name: "Сотрудник",
      role: "EMPLOYEE",
      limit: 1000000,
    });
    assert.equal(employeeR.status, 201);
    const employeeId = employeeR.data.id as string;
    const managerR = await req("/users", owner, {
      email: email("manager"),
      password: "LongPassword123!",
      name: "Руководитель",
      role: "MANAGER",
      limit: 1000000,
    });
    assert.equal(managerR.status, 201);
    const employee = (
      await req("/auth/login", "", {
        email: email("employee"),
        password: "LongPassword123!",
      })
    ).data.token as string;
    const manager = (
      await req("/auth/login", "", {
        email: email("manager"),
        password: "LongPassword123!",
      })
    ).data.token as string;
    assert.equal(
      (
        await req("/materials", employee, {
          title: "Запрещённый",
          text: source,
        })
      ).status,
      403,
    );
    assert.equal((await req("/admin/ledger", owner)).status, 403);
    const key = randomUUID();
    const tops = await Promise.all([
      req("/credits/topup", owner, { amount: 1000000, key }),
      req("/credits/topup", owner, { amount: 1000000, key }),
    ]);
    tops.forEach((r) => assert.equal(r.status, 201));
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000,
    );
    assert.equal(
      (await req("/credits/topup", owner, { amount: 2000000, key })).status,
      409,
    );
    const m = await req("/materials", owner, {
      title: "Обращения клиентов",
      text: source,
    });
    assert.equal(m.status, 201);
    const mid = m.data.id as string;
    assert.equal(
      (await req(`/materials/${mid}/generate`, otherToken, {})).status,
      404,
    );
    provider.delay = 100;
    const parallel = await Promise.all([
      req(`/materials/${mid}/generate`, owner, {}),
      req(`/materials/${mid}/generate`, owner, {}),
    ]);
    assert.ok(parallel.some((r) => r.status === 201));
    assert.ok(parallel.every((r) => [201, 409].includes(r.status)));
    provider.delay = 0;
    assert.equal(provider.calls, 1);
    const assignment = parallel.find((r) => r.status === 201)!.data;
    const aid = assignment.id as string;
    const again = await req(`/materials/${mid}/generate`, owner, {});
    assert.equal(again.data.id, aid);
    assert.equal(provider.calls, 1);
    assert.equal(
      (
        await req(`/assignments/${aid}/attempts`, otherToken, {
          answer: "Полный ответ недоступен другой компании",
        })
      ).status,
      404,
    );
    // Invalid/null -> invalid evidence -> valid, all 3 calls must be billed and audited.
    provider.responses = [
      null,
      { ...evaluation(), evidence: ["Выдуманная цитата"] },
      evaluation(),
    ];
    const answer = await req(`/assignments/${aid}/attempts`, employee, {
      answer:
        "Зарегистрирую обращение в CRM, подтвержу получение за два часа и передам руководителю при задержке.",
    });
    assert.equal(answer.status, 201);
    const count = provider.calls;
    const repeated = await req(`/assignments/${aid}/attempts`, employee, {
      answer:
        "Зарегистрирую обращение в CRM, подтвержу получение за два часа и передам руководителю при задержке.",
    });
    assert.equal(repeated.data.id, answer.data.id);
    assert.equal(provider.calls, count);
    const report = await req("/dashboard", manager);
    assert.equal((report.data.attempts as unknown[]).length, 1);
    const own = await req("/dashboard", employee);
    assert.equal((own.data.users as unknown[]).length, 0);
    assert.equal((own.data.transactions as unknown[]).length, 0);
    const otherDash = await req("/dashboard", otherToken);
    assert.equal((otherDash.data.materials as unknown[]).length, 0);
    const calls = await db.aiCall.findMany({ where: { companyId } });
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map((x) => x.validationStatus).sort(), [
      "INVALID",
      "INVALID",
      "VALID",
      "VALID",
    ]);
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000 - 4 * 270,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employeeId } })).spent,
      810,
    );
    // Exhausted schema retries charge every known usage.
    provider.responses = [{}, {}, {}];
    assert.equal(
      (
        await req(`/assignments/${aid}/attempts`, employee, {
          answer: "Совершенно другой ответ, проверка исчерпания retry.",
        })
      ).status,
      422,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employeeId } })).spent,
      1620,
    );
    // Employee limit and concurrent company reserve enforce pre-call bounds.
    await db.user.update({ where: { id: employeeId }, data: { limit: 1620 } });
    const pre = provider.calls;
    assert.equal(
      (
        await req(`/assignments/${aid}/attempts`, employee, {
          answer: "Новый ответ для проверки исчерпанного лимита.",
        })
      ).status,
      422,
    );
    assert.equal(provider.calls, pre);
    await db.user.update({
      where: { id: employeeId },
      data: { limit: 1000000 },
    });
    await db.company.update({
      where: { id: companyId },
      data: { balance: RESERVE },
    });
    const m2 = await req("/materials", owner, {
      title: "Материал для гонки",
      text: source + " Дополнительный порядок.",
    });
    const m3 = await req("/materials", owner, {
      title: "Второй для гонки",
      text: source + " Второй порядок.",
    });
    provider.delay = 150;
    const race = await Promise.all([
      req(`/materials/${m2.data.id}/generate`, owner, {}),
      req(`/materials/${m3.data.id}/generate`, owner, {}),
    ]);
    provider.delay = 0;
    assert.equal(race.filter((r) => r.status === 201).length, 1);
    assert.equal(race.filter((r) => r.status === 422).length, 1);
    assert.ok(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance >= 0,
    );
    // Deterministic ABA: pause a retry after reading REJECTED, let another zero-cost round finish, then resume stale CAS.
    await db.company.update({
      where: { id: companyId },
      data: { balance: 1000000 },
    });
    const abaAnswer = {
      answer: "Ответ для проверки ABA повторного отказа провайдера.",
    };
    provider.reject = true;
    assert.equal(
      (await req(`/assignments/${aid}/attempts`, employee, abaAnswer)).status,
      503,
    );
    const abaOp = await db.aiOperation.findFirstOrThrow({
      where: { companyId, status: "REJECTED" },
      orderBy: { createdAt: "desc" },
    });
    let releaseSnapshot: () => void = () => undefined;
    let snapshotLoaded: () => void = () => undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const snapshotReady = new Promise<void>((resolve) => {
      snapshotLoaded = resolve;
    });
    const pausingRepository = new Proxy(db, {
      get(target, key) {
        if (key !== "aiOperation") return Reflect.get(target, key);
        return new Proxy(target.aiOperation, {
          get(delegate, method) {
            if (method !== "findUnique") return Reflect.get(delegate, method);
            return async (args: Prisma.AiOperationFindUniqueArgs) => {
              const snapshot = await delegate.findUnique(args);
              if (snapshot?.id === abaOp.id) {
                snapshotLoaded();
                await snapshotGate;
              }
              return snapshot;
            };
          },
        });
      },
    });
    const assignmentForABA = await db.assignment.findUniqueOrThrow({
      where: { id: aid },
      include: { material: true },
    });
    const employeeForABA = await db.user.findUniqueOrThrow({
      where: { id: employeeId },
    });
    const staleRetry = new AiService(pausingRepository, provider).run(
      employeeForABA,
      "evaluate",
      {
        assignmentId: aid,
        source: assignmentForABA.material.text,
        criteria: assignmentForABA.criteria,
        question: assignmentForABA.content,
        answer: abaAnswer.answer,
      },
    );
    await snapshotReady;
    assert.equal(
      (await req(`/assignments/${aid}/attempts`, employee, abaAnswer)).status,
      503,
    );
    const callsBeforeStale = provider.calls;
    const txBeforeStale = await db.creditTransaction.count({
      where: { companyId },
    });
    releaseSnapshot();
    await assert.rejects(
      staleRetry,
      (error) =>
        error instanceof Error &&
        "getStatus" in error &&
        typeof error.getStatus === "function" &&
        error.getStatus() === 409,
    );
    assert.equal(provider.calls, callsBeforeStale);
    assert.equal(
      await db.creditTransaction.count({ where: { companyId } }),
      txBeforeStale,
    );
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000,
    );
    provider.reject = false;
    provider.responses = [
      {},
      new AiProviderRejection(429, "credit_balance_exhausted"),
    ];
    assert.equal(
      (await req(`/assignments/${aid}/attempts`, employee, abaAnswer)).status,
      503,
    );
    assert.equal(
      (await db.aiOperation.findUniqueOrThrow({ where: { id: abaOp.id } }))
        .cost,
      270,
    );
    assert.equal(
      (await req(`/assignments/${aid}/attempts`, employee, abaAnswer)).status,
      201,
    );
    const settledABA = await db.aiOperation.findUniqueOrThrow({
      where: { id: abaOp.id },
      include: { calls: true },
    });
    assert.equal(settledABA.cost, 540);
    assert.equal(
      settledABA.calls.reduce((sum, call) => sum + call.cost, 0),
      540,
    );
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000 - 540,
    );
    // Unknown outcome conservatively holds reserve and blocks repeat.
    await db.company.update({
      where: { id: companyId },
      data: { balance: 1000000 },
    });
    provider.reject = true;
    const beforeReject = await db.user.findUniqueOrThrow({
      where: { id: employeeId },
    });
    const rejectedAnswer = {
      answer: "Ответ для проверки известного отказа провайдера по квоте.",
    };
    assert.equal(
      (await req(`/assignments/${aid}/attempts`, employee, rejectedAnswer))
        .status,
      503,
    );
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employeeId } })).spent,
      beforeReject.spent,
    );
    const rejectedOp = await db.aiOperation.findFirstOrThrow({
      where: { companyId, status: "REJECTED" },
    });
    const rejectedCall = await db.aiCall.findFirstOrThrow({
      where: { operationId: rejectedOp.id },
    });
    assert.equal(rejectedCall.validationStatus, "PROVIDER_REJECTED");
    assert.equal(rejectedCall.cost, 0);
    assert.deepEqual(rejectedCall.responseJson, {
      status: 429,
      code: "credit_balance_exhausted",
    });
    provider.reject = false;
    // An explicit request may retry a known rejection; two concurrent retries cannot reserve twice.
    provider.delay = 150;
    const retried = await Promise.all([
      req(`/assignments/${aid}/attempts`, employee, rejectedAnswer),
      req(`/assignments/${aid}/attempts`, employee, rejectedAnswer),
    ]);
    provider.delay = 0;
    assert.equal(retried.filter((r) => r.status === 201).length, 1);
    assert.equal(retried.filter((r) => r.status === 409).length, 1);
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000 - 270,
    );
    await db.company.update({
      where: { id: companyId },
      data: { balance: 1000000 },
    });
    provider.fail = true;
    const failed = await req(`/assignments/${aid}/attempts`, employee, {
      answer: "Ответ для проверки неизвестного сетевого исхода.",
    });
    assert.equal(failed.status, 503);
    const unknownCalls = provider.calls;
    assert.equal(
      (
        await req(`/assignments/${aid}/attempts`, employee, {
          answer: "Ответ для проверки неизвестного сетевого исхода.",
        })
      ).status,
      409,
    );
    assert.equal(provider.calls, unknownCalls);
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .balance,
      1000000 - RESERVE,
    );
    assert.equal((await req("/auth/logout", employee, {})).status, 201);
    assert.equal((await req("/me", employee)).status, 401);
    console.log(
      "E2E PASS: register/company → roles → concurrent Demo topup → material → structured AI assignment → answer/retry/evidence → personal result → usage settlement → manager report; tenant/idempotency/concurrency/limit/unknown/logout assertions passed.",
    );
  } finally {
    for (const id of [companyId, bId].filter(Boolean)) {
      await db.aiCall.deleteMany({ where: { companyId: id } });
      await db.aiOperation.deleteMany({ where: { companyId: id } });
      await db.attempt.deleteMany({ where: { companyId: id } });
      await db.assignment.deleteMany({ where: { companyId: id } });
      await db.material.deleteMany({ where: { companyId: id } });
      await db.notification.deleteMany({ where: { companyId: id } });
      await db.creditTransaction.deleteMany({ where: { companyId: id } });
      await db.user.deleteMany({ where: { companyId: id } });
      await db.company.deleteMany({ where: { id } });
    }
    await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
