import { AppService } from "../src/service";
import { Prisma } from "@prisma/client";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/module";
import { AiProvider, AiProviderRejection, AiService, RESERVE } from "../src/ai";
import { Repository } from "../src/repository";
import { digest } from "../src/auth";
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
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded<T>(
  promise: Promise<T>,
  description: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out: ${description}`)),
          5000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
async function main() {
  let sessionReadGate:
    | {
        hash: string;
        entered: ReturnType<typeof deferred>;
        release: ReturnType<typeof deferred>;
      }
    | undefined;
  // This DI wrapper keeps real PostgreSQL persistence; it only pauses one observed auth snapshot.
  const realDatabase = new Repository();
  const coordinatedDatabase = new Proxy(realDatabase, {
    get(target, key) {
      if (key !== "session") return Reflect.get(target, key);
      return new Proxy(target.session, {
        get(delegate, method) {
          if (method !== "findUnique") return Reflect.get(delegate, method);
          return async (args: Prisma.SessionFindUniqueArgs) => {
            const snapshot = await delegate.findUnique(args);
            if (sessionReadGate && args.where.id === sessionReadGate.hash) {
              const gate = sessionReadGate;
              sessionReadGate = undefined;
              gate.entered.resolve();
              await gate.release.promise;
            }
            return snapshot;
          };
        },
      });
    },
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Repository)
    .useValue(coordinatedDatabase)
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
    const oldPolicy = {
      node: process.env.NODE_ENV,
      registration: process.env.ALLOW_PUBLIC_REGISTRATION,
      topups: process.env.ALLOW_MOCK_TOPUPS,
    };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_PUBLIC_REGISTRATION;
      delete process.env.ALLOW_MOCK_TOPUPS;
      assert.equal(
        (
          await req("/auth/register", "", {
            email: email("denied"),
            password: "LongPassword123!",
            name: "Denied",
            companyName: "Denied",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req("/credits/topup", owner, {
            amount: 1000000,
            key: randomUUID(),
          })
        ).status,
        403,
      );
    } finally {
      for (const [key, value] of [
        ["NODE_ENV", oldPolicy.node],
        ["ALLOW_PUBLIC_REGISTRATION", oldPolicy.registration],
        ["ALLOW_MOCK_TOPUPS", oldPolicy.topups],
      ]) {
        if (value === undefined) delete process.env[key!];
        else process.env[key!] = value;
      }
    }
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
    // Another company has its own workspace, not merely a hidden document list.
    assert.equal((otherDash.data.company as { id: string }).id, bId);
    for (const collection of [
      "assignments",
      "attempts",
      "transactions",
      "operations",
    ])
      assert.deepEqual(
        otherDash.data[collection],
        [],
        `foreign ${collection} must not appear`,
      );
    const otherTeam = otherDash.data.users as {
      id: string;
      companyId: string;
    }[];
    assert.equal(otherTeam.length, 1);
    assert.ok(otherTeam.every((user) => user.companyId === bId));
    assert.ok(!otherTeam.some((user) => user.id === employeeId));
    const assertNoPrivateFields = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(assertNoPrivateFields);
      } else if (value !== null && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          assert.ok(
            !["passwordHash", "sessions", "token", "attachmentKey"].includes(
              key,
            ),
            `private field ${key} must not leave dashboard`,
          );
          assertNoPrivateFields(nested);
        }
      }
    };
    for (const dashboard of [
      report,
      own,
      otherDash,
      await req("/dashboard", owner),
    ])
      assertNoPrivateFields(dashboard.data);
    // A foreign owner cannot mutate a known employee id or smuggle a tenant in a DTO.
    const protectedUserBefore = await db.user.findUniqueOrThrow({
      where: { id: employeeId },
      select: { limit: true, spent: true, companyId: true },
    });
    const callsBeforeForeignMutation = provider.calls;
    assert.equal(
      (
        await req(
          `/users/${employeeId}/limit`,
          otherToken,
          { limit: 0 },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.deepEqual(
      await db.user.findUniqueOrThrow({
        where: { id: employeeId },
        select: { limit: true, spent: true, companyId: true },
      }),
      protectedUserBefore,
    );
    assert.equal(
      (
        await req("/materials", otherToken, {
          title: "Tenant override denied",
          text: source,
          companyId,
        })
      ).status,
      400,
    );
    assert.equal(provider.calls, callsBeforeForeignMutation);
    assert.equal(
      (await db.company.findUniqueOrThrow({ where: { id: bId } })).balance,
      0,
    );
    // Even within one company an employee cannot see another employee's result or operations.
    const peerResult = await req("/users", owner, {
      email: email("peer"),
      password: "LongPassword123!",
      name: "Другой сотрудник",
      role: "EMPLOYEE",
      limit: 1000000,
    });
    assert.equal(peerResult.status, 201);
    const peerToken = (
      await req("/auth/login", "", {
        email: email("peer"),
        password: "LongPassword123!",
      })
    ).data.token as string;
    const peerDashboard = await req("/dashboard", peerToken);
    for (const collection of [
      "attempts",
      "operations",
      "users",
      "transactions",
    ])
      assert.deepEqual(
        peerDashboard.data[collection],
        [],
        `peer employee ${collection} is private`,
      );
    assert.equal((peerDashboard.data.materials as unknown[]).length, 1);
    assert.equal((peerDashboard.data.assignments as unknown[]).length, 1);
    assertNoPrivateFields(peerDashboard.data);
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
    // Force both linearizations of owner limit lowering versus employee reserve, twice, with no timing sleeps.
    for (let round = 0; round < 2; round++) {
      let beforeUser = await db.user.findUniqueOrThrow({
        where: { id: employeeId },
      });
      assert.equal(
        (
          await req(
            `/users/${employeeId}/limit`,
            owner,
            { limit: beforeUser.spent + RESERVE + 1000 },
            "PATCH",
          )
        ).status,
        200,
      );
      const beforeBalance = (
        await db.company.findUniqueOrThrow({ where: { id: companyId } })
      ).balance;
      const beforeTransactions = await db.creditTransaction.count({
        where: { companyId },
      });
      const beforeOperations = await db.aiOperation.count({
        where: { companyId },
      });
      const beforeCalls: number = provider.calls;
      const entered = deferred(),
        release = deferred();
      const originalComplete = provider.complete;
      provider.complete = async (
        ...args: Parameters<FixtureProvider["complete"]>
      ) => {
        const result = await originalComplete.call(provider, ...args);
        entered.resolve();
        await release.promise;
        return result;
      };
      const reservedRequest = req(`/assignments/${aid}/attempts`, employee, {
        answer: `Ответ для гонки лимита: резерв выигрывает, раунд ${round}.`,
      });
      try {
        await bounded(entered.promise, "employee reserve committed");
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: employeeId } }))
            .spent,
          beforeUser.spent + RESERVE,
        );
        assert.equal(
          (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
            .balance,
          beforeBalance - RESERVE,
        );
        assert.equal(
          (
            await bounded(
              req(
                `/users/${employeeId}/limit`,
                owner,
                { limit: beforeUser.spent },
                "PATCH",
              ),
              "owner concurrent limit response",
            )
          ).status,
          403,
        );
      } finally {
        release.resolve();
        provider.complete = originalComplete;
        await bounded(reservedRequest, "drain reserved request");
      }
      assert.equal(
        (await bounded(reservedRequest, "reserved answer settlement")).status,
        201,
      );
      const afterReserve = await db.user.findUniqueOrThrow({
        where: { id: employeeId },
      });
      assert.equal(afterReserve.spent, beforeUser.spent + 270);
      assert.ok(afterReserve.spent <= afterReserve.limit);
      assert.equal(
        (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
          .balance,
        beforeBalance - 270,
      );
      assert.equal(
        await db.creditTransaction.count({ where: { companyId } }),
        beforeTransactions + 2,
      );
      assert.equal(
        await db.aiOperation.count({ where: { companyId } }),
        beforeOperations + 1,
      );
      assert.equal(provider.calls, beforeCalls + 1);

      beforeUser = afterReserve;
      assert.equal(
        (
          await req(
            `/users/${employeeId}/limit`,
            owner,
            { limit: beforeUser.spent + RESERVE + 1000 },
            "PATCH",
          )
        ).status,
        200,
      );
      const unchangedBalance = (
        await db.company.findUniqueOrThrow({ where: { id: companyId } })
      ).balance;
      const unchangedTransactions = await db.creditTransaction.count({
        where: { companyId },
      });
      const unchangedOperations = await db.aiOperation.count({
        where: { companyId },
      });
      const unchangedCalls: number = provider.calls;
      const snapshotEntered = deferred(),
        snapshotRelease = deferred();
      sessionReadGate = {
        hash: digest(employee),
        entered: snapshotEntered,
        release: snapshotRelease,
      };
      const limitedRequest = req(`/assignments/${aid}/attempts`, employee, {
        answer: `Ответ для гонки лимита: снижение выигрывает, раунд ${round}.`,
      });
      try {
        await bounded(snapshotEntered.promise, "employee captured old limit");
        assert.equal(
          (
            await bounded(
              req(
                `/users/${employeeId}/limit`,
                owner,
                { limit: beforeUser.spent },
                "PATCH",
              ),
              "owner concurrent limit response",
            )
          ).status,
          200,
        );
      } finally {
        snapshotRelease.resolve();
        sessionReadGate = undefined;
        await bounded(limitedRequest, "drain limited request");
      }
      assert.equal(
        (await bounded(limitedRequest, "stale reserve rollback")).status,
        422,
      );
      const afterLimit = await db.user.findUniqueOrThrow({
        where: { id: employeeId },
      });
      assert.equal(afterLimit.limit, beforeUser.spent);
      assert.equal(afterLimit.spent, beforeUser.spent);
      assert.ok(afterLimit.spent <= afterLimit.limit);
      assert.equal(
        (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
          .balance,
        unchangedBalance,
      );
      assert.equal(
        await db.creditTransaction.count({ where: { companyId } }),
        unchangedTransactions,
      );
      assert.equal(
        await db.aiOperation.count({ where: { companyId } }),
        unchangedOperations,
      );
      assert.equal(provider.calls, unchangedCalls);
    }
    assert.equal(
      (
        await req(
          `/users/${employeeId}/limit`,
          owner,
          { limit: 1000000 },
          "PATCH",
        )
      ).status,
      200,
    );
    // Global admin counts are not truncated; an old unresolved operation remains visible past the recent window.
    const txBeforeWindow = await db.creditTransaction.count();
    const opBeforeWindow = await db.aiOperation.count();
    const oldUnresolved = await db.aiOperation.create({
      data: {
        companyId,
        userId: employeeId,
        requestHash: randomUUID(),
        kind: "WINDOW_TEST",
        status: "UNKNOWN",
        reserved: 0,
        createdAt: new Date("2000-01-01"),
      },
    });
    await db.aiOperation.createMany({
      data: Array.from({ length: 105 }, () => ({
        companyId,
        userId: employeeId,
        requestHash: randomUUID(),
        kind: "WINDOW_TEST",
        status: "SUCCESS",
        reserved: 0,
      })),
    });
    await db.creditTransaction.createMany({
      data: Array.from({ length: 205 }, () => ({
        companyId,
        userId: employeeId,
        key: randomUUID(),
        kind: "WINDOW_TEST",
        amount: 0,
      })),
    });
    const overview = await app.get(AppService).ledger();
    assert.equal(overview.totals.transactions, txBeforeWindow + 205);
    assert.equal(overview.totals.operations, opBeforeWindow + 106);
    assert.equal(overview.transactions.length, 200);
    assert.ok(overview.operations.some((o) => o.id === oldUnresolved.id));
    assert.ok(overview.totals.operations > overview.operations.length);
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
    // Legacy records stay readable, but new grading is rejected before any reservation/provider call.
    provider.fail = false;
    const legacyMaterial = await req("/materials", owner, {
      title: "Исторический материал",
      text: source,
    });
    const legacyContent = {
      summary: "Старая методика",
      question: "Опишите действия по регламенту.",
      evidence: ["Сотрудник регистрирует обращение в CRM."],
    };
    const legacyOperation = await db.aiOperation.create({
      data: {
        companyId,
        userId: employeeId,
        kind: "generate",
        requestHash: randomUUID(),
        status: "SUCCESS",
        reserved: 0,
        result: legacyContent,
      },
    });
    const legacy = await db.assignment.create({
      data: {
        companyId,
        materialId: legacyMaterial.data.id as string,
        operationId: legacyOperation.id,
        content: legacyContent,
        criteria: assignmentForABA.criteria as Prisma.InputJsonValue,
      },
    });
    const historic = await db.attempt.create({
      data: {
        companyId,
        assignmentId: legacy.id,
        userId: employeeId,
        operationId: legacyOperation.id,
        answer: "Исторический ответ сотрудника",
        evaluation: evaluation() as Prisma.InputJsonValue,
      },
    });
    const financialState = async () => ({
      company: await db.company.findUniqueOrThrow({ where: { id: companyId } }),
      user: await db.user.findUniqueOrThrow({ where: { id: employeeId } }),
      operations: await db.aiOperation.count({ where: { companyId } }),
      calls: await db.aiCall.count({ where: { companyId } }),
      ledger: await db.creditTransaction.count({ where: { companyId } }),
      providerCalls: provider.calls,
    });
    const beforeLegacy = await financialState();
    const blockedLegacy = await req(
      `/assignments/${legacy.id}/attempts`,
      employee,
      { answer: "Новый ответ на старое задание" },
    );
    assert.equal(blockedLegacy.status, 409);
    assert.match(String(blockedLegacy.data.message), /обновить задание/);
    assert.deepEqual(await financialState(), beforeLegacy);
    assert.equal(
      (await req(`/materials/${legacy.materialId}/generate`, employee, {}))
        .status,
      403,
    );
    assert.deepEqual(await financialState(), beforeLegacy);
    const ownerUpgrade = await req(
      `/materials/${legacy.materialId}/generate`,
      owner,
      {},
    );
    const managerUpgrade = await req(
      `/materials/${legacy.materialId}/generate`,
      manager,
      {},
    );
    for (const upgraded of [ownerUpgrade, managerUpgrade]) {
      assert.equal(upgraded.status, 201);
      assert.notEqual(upgraded.data.id, legacy.id);
      assert.equal((upgraded.data.content as { version: number }).version, 2);
    }
    assert.deepEqual(
      await db.assignment.findUniqueOrThrow({ where: { id: legacy.id } }),
      legacy,
    );
    assert.deepEqual(
      await db.attempt.findUniqueOrThrow({ where: { id: historic.id } }),
      historic,
    );
    const afterUpgrade = await req("/dashboard", employee);
    const materialAssignments = (
      afterUpgrade.data.assignments as { id: string; materialId: string }[]
    ).filter((a) => a.materialId === legacy.materialId);
    assert.equal(materialAssignments[0].id, managerUpgrade.data.id);
    assert.ok(
      (afterUpgrade.data.attempts as { id: string }[]).some(
        (a) => a.id === historic.id,
      ),
    );
    assert.equal((await req("/auth/logout", employee, {})).status, 201);
    assert.equal((await req("/me", employee)).status, 401);
    console.log(
      "E2E PASS: register/company → roles → concurrent Demo topup → material → structured AI assignment → answer/retry/evidence → personal result → usage settlement → manager report; tenant/idempotency/concurrency/limit/reserve-vs-limit-both-orders/unknown/logout assertions passed.",
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
