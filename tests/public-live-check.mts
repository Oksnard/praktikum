import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { productionPolicy } from "../apps/api/src/production-policy.ts";
import type { AdminLedger, Dashboard, Role, UserView } from "@praktikum/types";

type AuditedDashboard = Omit<Dashboard, "assignments" | "attempts"> & {
  assignments: (Dashboard["assignments"][number] & { operationId: string })[];
  attempts: (Dashboard["attempts"][number] & {
    operationId: string;
    assignmentId: string;
  })[];
};
type AuditedLedger = Omit<AdminLedger, "calls"> & {
  calls: (AdminLedger["calls"][number] & { operationId: string })[];
};
type Account = { company: string; role: Role; email: string; password: string };
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const gateUser = process.env.PLAYWRIGHT_GATE_USER;
const gatePassword = process.env.PLAYWRIGHT_GATE_PASSWORD;
if (!baseURL?.startsWith("https://") || !gateUser || !gatePassword)
  throw new Error("Private HTTPS browser environment is required");
const accounts = JSON.parse(
  await readFile(".runtime/review/accounts.json", "utf8"),
) as { accounts: Account[] };
const actor = (role: Role, company = "alpha") => {
  const account = accounts.accounts.find(
    (a) => a.role === role && a.company === company,
  );
  if (!account) throw new Error("Required review role is missing");
  return account;
};
const apiSessions: string[] = [];
async function api<T>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const response = await fetch(`http://127.0.0.1:3311${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: (await response.json()) as T };
}
async function apiLogin(role: Role) {
  const account = actor(role);
  const response = await api<{ token: string; user: UserView }>(
    "/auth/login",
    undefined,
    { email: account.email, password: account.password },
  );
  if (response.status !== 201)
    throw new Error("Review API authentication failed");
  apiSessions.push(response.data.token);
  return response.data.token;
}
let stage = "initialization";
const browser = await chromium.launch({ headless: true });
const contexts: BrowserContext[] = [];
async function context() {
  const item = await browser.newContext({
    baseURL,
    viewport: { width: 1280, height: 900 },
    httpCredentials: {
      username: gateUser!,
      password: gatePassword!,
      origin: new URL(baseURL!).origin,
    },
  });
  contexts.push(item);
  return item;
}
async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Пароль").fill(account.password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)$/, { timeout: 20000 });
}
async function dismiss(page: Page) {
  const close = page.getByRole("button", { name: "Пропустить обучение" });
  await close
    .waitFor({ state: "visible", timeout: 3000 })
    .catch(() => undefined);
  if (await close.isVisible()) await close.click();
}
try {
  stage = "anonymous HTTPS protection";
  const anonymous = await fetch(`${baseURL}/login`);
  expect(anonymous.status).toBe(401);
  const ownerToken = await apiLogin("OWNER");
  const before = (await api<Dashboard>("/dashboard", ownerToken)).data;
  const started = new Date().toISOString();
  const ownerContext = await context();
  const owner = await ownerContext.newPage();
  stage = "owner login and first visit tour";
  await login(owner, actor("OWNER"));
  const tour = owner.locator("[data-onboarding-tour=true]");
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(
    tour.getByText("Материалы и задания", { exact: true }),
  ).toBeVisible();
  await owner.screenshot({
    path: "docs/screenshots/public-onboarding.jpg",
    fullPage: false,
  });
  await dismiss(owner);
  const cookie = (await ownerContext.cookies()).find(
    (item) => item.name === "praktikum_session",
  );
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");

  stage = "public DOCX upload and authenticated original download";
  const title = `Обучение по документу через HTTPS ${randomUUID().slice(0, 8)}`;
  await owner.getByLabel("Название документа").fill(title);
  await owner
    .getByLabel("Файл материала")
    .setInputFiles("apps/api/test/document-fixtures/russian.docx");
  await owner
    .getByRole("button", { name: "Загрузить документ", exact: true })
    .click();
  const card = owner
    .locator(".material-card")
    .filter({ has: owner.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText(
    "Перед встречей сотрудник изучает запрос клиента.",
  );
  const href = await card
    .getByRole("link", { name: "Скачать russian.docx" })
    .getAttribute("href");
  if (!href) throw new Error("Original download URL missing");
  const downloaded = await ownerContext.request.get(href);
  expect(downloaded.status()).toBe(200);
  const sha = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  expect(sha(await downloaded.body())).toBe(
    sha(await readFile("apps/api/test/document-fixtures/russian.docx")),
  );

  stage = "real DeepSeek assignment from extracted document";
  await card.getByRole("button", { name: /Создать задание/ }).click();
  await expect(card.locator(".assignment-box")).toBeVisible({ timeout: 90000 });
  const employeeContext = await context();
  const employee = await employeeContext.newPage();
  await login(employee, actor("EMPLOYEE"));
  await dismiss(employee);
  const employeeCard = employee.locator(".material-card").filter({
    has: employee.getByRole("heading", { name: title, exact: true }),
  });
  await expect(employeeCard.locator(".question-prompt")).not.toBeEmpty();
  stage = "employee answer and real assessment";
  await employeeCard
    .getByLabel("Ваш ответ")
    .fill(
      "Перед встречей я изучу запрос клиента. После встречи запишу договорённости в систему и назначу следующий шаг.",
    );
  await employeeCard
    .getByRole("button", { name: "Отправить на оценку" })
    .click();
  await expect(employee.locator(".result-card")).toBeVisible({
    timeout: 90000,
  });
  await expect(employee.locator(".result-card .result-evidence")).toContainText(
    "Перед встречей",
  );
  stage = "manager result and recommendations";
  const managerContext = await context();
  const manager = await managerContext.newPage();
  await login(manager, actor("MANAGER"));
  await dismiss(manager);
  await manager.getByText("Разбор", { exact: true }).click();
  await expect(manager.locator("details[open]")).toContainText(
    "Критерии оценки",
  );
  await expect(manager.locator("details[open]")).toContainText(
    "Опора на материал",
  );
  await manager.screenshot({
    path: "docs/screenshots/public-result.jpg",
    fullPage: false,
  });

  stage = "cross-company download isolation";
  const betaContext = await context();
  const beta = await betaContext.newPage();
  await login(beta, actor("EMPLOYEE", "beta"));
  await dismiss(beta);
  expect((await betaContext.request.get(href)).status()).toBe(404);
  await expect(
    beta.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);

  stage = "actual usage ledger, production policy and mobile layout";
  const after = (await api<AuditedDashboard>("/dashboard", ownerToken)).data;
  const adminToken = await apiLogin("SUPER_ADMIN");
  const ledger = (await api<AuditedLedger>("/admin/ledger", adminToken)).data;
  const material = after.materials.find((item) => item.title === title);
  if (!material) throw new Error("Uploaded material missing after real flow");
  const scenarioAssignments = after.assignments.filter(
    (item) => item.materialId === material.id,
  );
  expect(scenarioAssignments).toHaveLength(1);
  const assignmentIds = new Set(scenarioAssignments.map((item) => item.id));
  const scenarioAttempts = after.attempts.filter(
    (item) => assignmentIds.has(item.assignmentId) && item.createdAt >= started,
  );
  expect(scenarioAttempts).toHaveLength(1);
  const operationIds = new Set(
    [...scenarioAssignments, ...scenarioAttempts].map(
      (item) => item.operationId,
    ),
  );
  expect(operationIds.size).toBe(2);
  const calls = ledger.calls.filter(
    (item) =>
      item.companyId === after.company!.id &&
      operationIds.has(item.operationId),
  );
  // The balance delta assumes an exclusive window for this review company.
  // Other companies' calls are excluded by both tenant and exact scenario operations.
  const charged = calls.reduce((sum, item) => sum + item.cost, 0);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(
    [...operationIds].every((id) =>
      calls.some((call) => call.operationId === id),
    ),
  ).toBe(true);
  expect(before.company!.balance - after.company!.balance).toBe(charged);
  const score = scenarioAttempts[0]?.evaluation.score;
  const repeat = await api<{ id: string }>(
    `/materials/${material.id}/generate`,
    ownerToken,
    {},
  );
  expect(repeat.status).toBe(201);
  expect(
    (await api<Dashboard>("/dashboard", ownerToken)).data.company!.balance,
  ).toBe(after.company!.balance);
  // Optional configuration check only: never POST a disposable registration here.
  const expectedRegistration = process.env.PLAYWRIGHT_EXPECT_REGISTRATION;
  let registrationPolicy: boolean | undefined;
  if (expectedRegistration !== undefined) {
    if (!["true", "false"].includes(expectedRegistration))
      throw new Error("PLAYWRIGHT_EXPECT_REGISTRATION must be true or false");
    const reviewEnvironment = parseEnv(
      await readFile(".runtime/review/api.env", "utf8"),
    );
    registrationPolicy = productionPolicy(reviewEnvironment).allowRegistration;
    expect(registrationPolicy).toBe(expectedRegistration === "true");
  }
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.reload();
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await owner.getByRole("button", { name: "Запустить обучение снова" }).click();
  await expect(owner.locator("[data-onboarding-tour=true]")).toBeVisible();
  const box = await owner.locator("[data-onboarding-tour=true]").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await owner.screenshot({
    path: "docs/screenshots/public-mobile-tour.jpg",
    fullPage: false,
  });
  await owner.keyboard.press("Escape");
  await expect(owner.locator("[data-onboarding-tour=true]")).toHaveCount(0);
  const summary = {
    status: "PASS",
    url: baseURL,
    uploadedOriginalMatches: true,
    score,
    evidence: scenarioAttempts[0]?.evaluation.evidence.length,
    realProviderCalls: calls.length,
    chargedInternalCredits: charged,
    cachedGenerationCharge: 0,
    crossCompanyDownload: 404,
    registrationPolicyConfiguration: registrationPolicy ?? "not checked",
    secureHttpOnlyLaxCookie: true,
    mobile390px: true,
    firstVisitAndReplayTour: true,
  };
  await writeFile(
    ".runtime/review/public-live-result.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAIL",
      stage,
      errorType: error instanceof Error ? error.name : "unknown",
    }),
  );
  process.exitCode = 1;
} finally {
  for (const token of apiSessions)
    await api("/auth/logout", token, {}).catch(() => undefined);
  for (const item of contexts) await item.close();
  await browser.close();
}
