/** Manual paid QA: --prepare, inspect question, author cases.json, then --evaluate. No provider retry wrapper. */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, chmod, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  StoredAssignmentSchema as AssignmentSchema,
  StoredEvaluationSchema as EvaluationSchema,
  AssignmentV2Schema,
  EvaluationV2Schema,
  criteria,
} from "../packages/types/src/index.ts";
const policy5 = process.argv.includes("--policy5");
const v2 = process.argv.includes("--v2") || policy5;
const root = path.resolve(
  v2 ? ".runtime/ai-quality-assessment-v2" : ".runtime/ai-quality-assessment",
);
const accessPath = path.join(root, "access.json");
const apiBase = "http://127.0.0.1:3311";
const db = new PrismaClient();
const sessions: string[] = [];
let stage = "initialize";
type Account = { id: string; email: string; password: string };
type State = {
  kind: "ai-quality-assessment-v1";
  runId: string;
  companyId: string;
  companyName: string;
  directory: string;
  owner: Account;
  employee: Account;
  materialId: string;
  assignmentId: string;
};
type Case = {
  id: string;
  answer: string;
  scoreBand: [number, number];
  expectedActions: string[];
  intentionalOmissions: string[];
  expectedCriterionBands: { id: string; band: [number, number] }[];
};
type Material = { id: string; text: string };
type Assignment = { id: string; materialId: string; content: unknown };
type Attempt = { id: string; operationId: string; evaluation: unknown };
let state: State | undefined;
async function save(name: string, data: unknown) {
  assert.ok(state);
  const directory = policy5
    ? path.join(state.directory, "policy5")
    : state.directory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, name);
  await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  await chmod(file, 0o600);
}
async function api<T>(
  endpoint: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(apiBase + endpoint, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body !== undefined && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(240000),
  });
  if (!response.ok)
    throw new Error(`QA HTTP ${response.status} at ${endpoint}`);
  return (await response.json()) as T;
}
async function login(account: Account) {
  const result = await api<{
    token: string;
    user: { id: string; companyId: string };
  }>("/auth/login", undefined, {
    email: account.email,
    password: account.password,
  });
  assert.equal(result.user.id, account.id);
  assert.equal(result.user.companyId, state!.companyId);
  sessions.push(result.token);
  return result.token;
}
async function assertIdentity() {
  assert.ok(state?.kind === "ai-quality-assessment-v1");
  assert.ok(state.companyName === `QA-AI-QUALITY-${state.runId}`);
  const company = await db.company.findUniqueOrThrow({
    where: { id: state.companyId },
    select: { id: true, name: true },
  });
  assert.equal(company.name, state.companyName);
  const users = await db.user.findMany({
    where: { companyId: state.companyId },
    select: { id: true, email: true, role: true },
  });
  assert.equal(
    users.length,
    2,
    "QA workspace must contain only our owner and employee",
  );
  assert.ok(
    users.some(
      (u) =>
        u.id === state!.owner.id &&
        u.email === state!.owner.email &&
        u.role === "OWNER",
    ),
  );
  assert.ok(
    users.some(
      (u) =>
        u.id === state!.employee.id &&
        u.email === state!.employee.email &&
        u.role === "EMPLOYEE",
    ),
  );
}
async function snapshot() {
  await assertIdentity();
  const [company, users, operations, transactions, attempts] =
    await Promise.all([
      db.company.findUniqueOrThrow({
        where: { id: state!.companyId },
        select: { id: true, name: true, balance: true },
      }),
      db.user.findMany({
        where: { companyId: state!.companyId },
        select: { id: true, role: true, spent: true, limit: true },
      }),
      db.aiOperation.findMany({
        where: { companyId: state!.companyId },
        include: { calls: true },
        orderBy: { createdAt: "asc" },
      }),
      db.creditTransaction.findMany({
        where: { companyId: state!.companyId },
        orderBy: { createdAt: "asc" },
      }),
      db.attempt.findMany({
        where: { companyId: state!.companyId },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  await save("audit.json", {
    company,
    users,
    operations,
    transactions,
    attempts,
  });
  const operationCost = operations.reduce((n, o) => n + o.cost, 0),
    callCost = operations
      .flatMap((o) => o.calls)
      .reduce((n, c) => n + c.cost, 0);
  const ledgerDelta = transactions.reduce((n, t) => n + t.amount, 0);
  const unresolved = operations.filter((o) =>
    ["PENDING", "UNKNOWN"].includes(o.status),
  );
  if (!unresolved.length) {
    assert.equal(operationCost, callCost);
    assert.equal(company.balance, ledgerDelta);
    assert.equal(500000 - company.balance, operationCost);
    assert.equal(
      users.reduce((n, u) => n + u.spent, 0),
      operationCost,
    );
  }
  return {
    operations: operations.length,
    calls: operations.reduce((n, o) => n + o.calls.length, 0),
    operationCost,
    callCost,
    balance: company.balance,
    ledgerDelta,
    unresolved: unresolved.length,
  };
}
async function prepare() {
  try {
    await access(accessPath);
    throw new Error(
      "QA access file already exists; refusing another paid generation",
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  const runId = randomUUID();
  const password = () => randomBytes(24).toString("base64url");
  const owner = {
    id: "",
    email: `quality-${runId}-owner@example.test`,
    password: password(),
  };
  const employee = {
    id: "",
    email: `quality-${runId}-employee@example.test`,
    password: password(),
  };
  state = {
    kind: "ai-quality-assessment-v1",
    runId,
    companyId: "",
    companyName: `QA-AI-QUALITY-${runId}`,
    directory: path.join(root, runId),
    owner,
    employee,
    materialId: "",
    assignmentId: "",
  };
  await mkdir(state.directory, { recursive: true, mode: 0o700 });
  stage = "register own QA workspace";
  const registered = await api<{
    token: string;
    user: { id: string; companyId: string };
  }>("/auth/register", undefined, {
    email: owner.email,
    password: owner.password,
    name: "QA owner",
    companyName: state.companyName,
  });
  owner.id = registered.user.id;
  state.companyId = registered.user.companyId;
  sessions.push(registered.token);
  const emp = await api<{ id: string; companyId: string }>(
    "/users",
    registered.token,
    {
      email: employee.email,
      password: employee.password,
      name: "QA learner",
      role: "EMPLOYEE",
      limit: 500000,
    },
  );
  employee.id = emp.id;
  assert.equal(emp.companyId, state.companyId);
  await writeFile(accessPath, JSON.stringify(state, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  await assertIdentity();
  const initial = await db.company.findUniqueOrThrow({
    where: { id: state.companyId },
    select: { balance: true },
  });
  assert.equal(initial.balance, 0);
  await api("/credits/topup", registered.token, {
    amount: 500000,
    key: randomUUID(),
  });
  stage = "upload our fictional DOCX";
  const file = await readFile(
    "docs/examples/reglament-klientskie-obrashcheniya.docx",
  );
  const form = new FormData();
  form.set("title", `QA quality source ${runId}`);
  form.set(
    "file",
    new Blob([new Uint8Array(file)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "reglament-klientskie-obrashcheniya.docx",
  );
  const material = await api<Material>(
    "/materials/upload",
    registered.token,
    form,
  );
  state.materialId = material.id;
  await save("source.json", {
    docxSha256: createHash("sha256").update(file).digest("hex"),
    text: material.text,
    length: material.text.length,
  });
  await save("baseline-before-generation.json", {
    writtenAt: new Date().toISOString(),
    criteria,
    scoreBands: { full: [85, 100], partial: [30, 75], unsafe: [0, 35] },
    sourceActions: [
      "CRM: время, имя/контакт, заказ, суть вопроса; одна карточка",
      "Не запрашивать/хранить пароль и полные данные карты",
      "Первый ответ в течение 2 рабочих часов; Пн–Пт9–18; подтверждение, номер, срок следующего обновления",
      "Проверить заказ и недостающие факты",
      "Нельзя решить до конца следующего рабочего дня: эскалация с проблемой/проверенными фактами/ожидаемым решением",
      "Возврат: письменное согласование; до него не обещать возврат/скидку/точный срок перечисления",
      "Обновление минимум раз в рабочий день",
      "CRM: решение, обещания, ответственный и срок следующего шага",
      "Закрыть только после подтверждения клиента, не по молчанию",
    ],
    policy:
      "Case-specific expected actions and answers must be fixed after generated question and BEFORE any evaluation response.",
  });
  stage = "real generation (operation 1 of 4)";
  const assignment = await api<Assignment>(
    `/materials/${material.id}/generate`,
    registered.token,
    {},
  );
  AssignmentSchema.parse(assignment.content);
  if (v2) AssignmentV2Schema.parse(assignment.content);
  assert.equal(assignment.materialId, material.id);
  state.assignmentId = assignment.id;
  await save("assignment.json", assignment);
  await writeFile(accessPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      stage: "PREPARED",
      directory: state.directory,
      sourceChars: material.text.length,
      assignmentSaved: true,
      expectationsBeforeGenerationSaved: true,
      ...(await snapshot()),
    }),
  );
}
async function evaluate() {
  state = JSON.parse(await readFile(accessPath, "utf8")) as State;
  await assertIdentity();
  const existing = await db.aiOperation.count({
    where: { companyId: state.companyId },
  });
  const remaining = process.argv.includes("--remaining");
  assert.equal(
    existing,
    policy5 ? 4 : remaining ? 2 : 1,
    "Refusing unbounded additional operations",
  );
  const plan = JSON.parse(
    await readFile(path.join(state.directory, "cases.json"), "utf8"),
  ) as { writtenAt: string; question: string; cases: Case[] };
  assert.equal(plan.cases.length, 3);
  assert.deepEqual(
    plan.cases.map((c) => c.id),
    ["full", "partial", "unsafe"],
  );
  assert.equal(new Set(plan.cases.map((c) => c.answer)).size, 3);
  const assignment = JSON.parse(
    await readFile(path.join(state.directory, "assignment.json"), "utf8"),
  ) as Assignment;
  assert.equal(
    AssignmentSchema.parse(assignment.content).question,
    plan.question,
  );
  if (remaining || policy5) {
    const sealed = JSON.parse(
      await readFile(
        path.join(
          state.directory,
          "sealed-expectations-before-evaluations.json",
        ),
        "utf8",
      ),
    );
    assert.deepEqual(sealed.cases, plan.cases);
    assert.equal(sealed.question, plan.question);
  } else {
    await writeFile(
      path.join(state.directory, "sealed-expectations-before-evaluations.json"),
      JSON.stringify({ ...plan, sealedAt: new Date().toISOString() }, null, 2),
      { mode: 0o600, flag: "wx" },
    );
  }
  const employeeToken = await login(state.employee);
  const results: {
    case: string;
    status?: string;
    score?: number;
    band?: [number, number];
    bandPass?: boolean;
  }[] = remaining ? [{ case: "full", status: "NO_VALID_REPORT" }] : [];
  for (const [index, test] of plan.cases.entries()) {
    if (remaining && test.id === "full") continue;
    try {
      stage = `real evaluation ${test.id} (operation ${index + 2} of 4)`;
      const attempt = await api<Attempt>(
        `/assignments/${state.assignmentId}/attempts`,
        employeeToken,
        { answer: test.answer },
      );
      const evaluation = EvaluationSchema.parse(attempt.evaluation);
      if (v2)
        assert.equal(
          EvaluationV2Schema.parse(attempt.evaluation).assessment_mode,
          "snapshot",
        );
      const source = JSON.parse(
        await readFile(path.join(state.directory, "source.json"), "utf8"),
      ) as { text: string };
      const exactEvidence = evaluation.evidence.every(
        (q) => q.trim().length > 0 && source.text.includes(q),
      );
      assert.ok(exactEvidence);
      assert.equal(
        evaluation.criteria.reduce((n, c) => n + c.score, 0),
        evaluation.score,
      );
      const bandPass =
        evaluation.score >= test.scoreBand[0] &&
        evaluation.score <= test.scoreBand[1];
      const result = {
        case: test.id,
        expectation: test,
        attempt,
        evaluation,
        checks: {
          exactEvidence,
          scoreSum: true,
          predeclaredBandPass: bandPass,
          criterionBands: test.expectedCriterionBands.map((c) => ({
            id: c.id,
            actual: evaluation.criteria.find((x) => x.id === c.id)?.score,
            expected: c.band,
          })),
        },
      };
      await save(`result-${test.id}.json`, result);
      results.push({
        case: test.id,
        score: evaluation.score,
        band: test.scoreBand,
        bandPass,
      });
      await snapshot();
    } catch (error) {
      await save(`result-${test.id}.json`, {
        case: test.id,
        expectation: test,
        status: "NO_VALID_REPORT",
        errorType: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      results.push({ case: test.id, status: "NO_VALID_REPORT" });
      await snapshot();
    }
  }
  const totals = await snapshot();
  assert.equal(totals.operations, policy5 ? 7 : 4);
  assert.equal(totals.unresolved, 0);
  await save("summary.json", {
    results,
    ...totals,
    semanticReview:
      "Manual source/answer/evidence/gaps/recommendations review required; score bands alone do not prove correctness.",
  });
  console.log(
    JSON.stringify({
      status: "EVALUATED",
      results,
      ...totals,
      paidWorkspacePreserved: true,
    }),
  );
}
await mkdir(root, { recursive: true, mode: 0o700 });
await chmod(root, 0o700);
try {
  if (policy5 && !process.argv.includes("--evaluate"))
    throw new Error("policy5 only reevaluates the unchanged sealed cases");
  if (process.argv.includes("--prepare")) await prepare();
  else if (process.argv.includes("--evaluate")) await evaluate();
  else
    throw new Error(
      "Choose --prepare then --evaluate after writing cases.json",
    );
} catch (error) {
  if (state?.companyId)
    await save("failure.json", {
      stage,
      errorType: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown",
    }).catch(() => undefined);
  console.error(
    JSON.stringify({
      status: "FAIL",
      stage,
      errorType: error instanceof Error ? error.name : "unknown",
      rawEvidencePrivate: true,
    }),
  );
  process.exitCode = 1;
} finally {
  for (const token of sessions)
    await fetch(apiBase + "/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  if (state?.companyId) {
    try {
      await assertIdentity();
      await snapshot();
      await db.session.deleteMany({
        where: {
          userId: { in: [state.owner.id, state.employee.id].filter(Boolean) },
          user: { companyId: state.companyId },
        },
      });
    } catch {
      await save("revocation-not-completed.json", {
        reason:
          "Identity guard or database check failed; no broad revocation attempted",
      }).catch(() => undefined);
    }
  }
  await db.$disconnect();
}
