import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Dashboard } from "@praktikum/types";

// Run with the private review api.env and browser.env loaded by Node.
// No traces, screenshots, credentials or full assertion errors are persisted.
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const username = process.env.PLAYWRIGHT_GATE_USER;
const gatePassword = process.env.PLAYWRIGHT_GATE_PASSWORD;
const databaseURL = new URL(process.env.DATABASE_URL ?? "");
if (
  !baseURL?.startsWith("https://") ||
  !username ||
  !gatePassword ||
  !["127.0.0.1", "localhost", "::1"].includes(databaseURL.hostname)
) {
  throw new Error(
    "Private HTTPS review and loopback database configuration required",
  );
}
const id = randomUUID();
const companyName = `HTTPS-REG-${id}`;
const email = `https-reg-${id}@example.test`;
const password = `Registration-${randomBytes(24).toString("hex")}!`;
const db = new PrismaClient();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 900 },
  httpCredentials: {
    username,
    password: gatePassword,
    origin: new URL(baseURL).origin,
  },
});
const page = await context.newPage();
let stage = "initialization";
let passed = false;
let cleanup = false;
let failureType: string | undefined;
async function dashboard(): Promise<Dashboard> {
  const cookie = (await context.cookies()).find(
    (item) => item.name === "praktikum_session",
  );
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const response = await fetch("http://127.0.0.1:3311/dashboard", {
    headers: { Authorization: `Bearer ${cookie!.value}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Dashboard;
}
function expectEmpty(data: Dashboard) {
  expect(data.company?.name).toBe(companyName);
  expect(data.company?.balance).toBe(0);
  expect(data.user.role).toBe("OWNER");
  expect(data.user.email).toBe(email);
  expect(data.users).toHaveLength(1);
  expect(data.users[0]?.email).toBe(email);
  for (const rows of [
    data.materials,
    data.assignments,
    data.attempts,
    data.transactions,
    data.operations,
  ])
    expect(rows).toHaveLength(0);
}
try {
  stage = "HTTPS registration form";
  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Проверка регистрации");
  await page.getByLabel("Название компании").fill(companyName);
  await page.getByLabel("Рабочий email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Создать компанию/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
  stage = "first visit onboarding";
  const tour = page.getByRole("dialog");
  await expect(tour).toBeVisible();
  await expect(tour.getByText("1 из 5")).toBeVisible();
  await tour.getByRole("button", { name: "Пропустить обучение" }).click();
  stage = "empty owner workspace and secure session";
  await expect(page.locator(".company-chip")).toContainText(companyName);
  await expect(page.locator("#materials")).toContainText(
    "Начните с первого материала",
  );
  await expect(page.locator("#results")).toContainText("Ответов пока нет");
  await expect(page.locator("#team tbody tr")).toHaveCount(1);
  expectEmpty(await dashboard());
  stage = "logout and fresh login";
  await page.getByTitle("Выйти", { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20000 });
  expect(
    (await context.cookies()).some((item) => item.name === "praktikum_session"),
  ).toBe(false);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
  const current = await dashboard();
  expectEmpty(current);
  stage = "alpha tenant isolation";
  const accounts = JSON.parse(
    await readFile(".runtime/review/accounts.json", "utf8"),
  ) as {
    accounts: { company: string; role: string; email: string }[];
  };
  const alphaOwner = accounts.accounts.find(
    (a) => a.company === "alpha" && a.role === "OWNER",
  );
  if (!alphaOwner) throw new Error("Missing reference tenant");
  const reference = await db.user.findUniqueOrThrow({
    where: { email: alphaOwner.email },
  });
  expect(current.company?.id).not.toBe(reference.companyId);
  const material = await db.material.findFirstOrThrow({
    where: { companyId: reference.companyId!, attachmentKey: { not: null } },
  });
  expect(
    (await context.request.get(`/api/materials/${material.id}/file`)).status(),
  ).toBe(404);
  await expect(
    page.getByRole("heading", { name: material.title, exact: true }),
  ).toHaveCount(0);
  passed = true;
} catch (error) {
  failureType = error instanceof Error ? error.name : "unknown";
} finally {
  try {
    // Exact unique name AND unique owner are required before deleting this tenant.
    await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { email } });
      if (!owner) {
        cleanup = true;
        return;
      }
      if (!owner.companyId) throw new Error("Cleanup owner has no tenant");
      const company = await tx.company.findUniqueOrThrow({
        where: { id: owner.companyId },
      });
      if (company.name !== companyName)
        throw new Error("Cleanup tenant mismatch");
      const companyId = company.id;
      await tx.session.deleteMany({ where: { user: { companyId } } });
      await tx.attempt.deleteMany({ where: { companyId } });
      await tx.assignment.deleteMany({ where: { companyId } });
      await tx.material.deleteMany({ where: { companyId } });
      await tx.aiCall.deleteMany({ where: { companyId } });
      await tx.aiOperation.deleteMany({ where: { companyId } });
      await tx.notification.deleteMany({ where: { companyId } });
      await tx.creditTransaction.deleteMany({ where: { companyId } });
      await tx.user.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    });
    cleanup =
      (await db.user.count({ where: { email } })) === 0 &&
      (await db.company.count({ where: { name: companyName } })) === 0;
  } catch {
    cleanup = false;
  }
  await context.close();
  await browser.close();
  await db.$disconnect();
  const result = {
    status: passed && cleanup ? "PASS" : "FAIL",
    url: baseURL,
    checkedAt: new Date().toISOString(),
    ...(passed
      ? {
          registration: true,
          ownerOnly: true,
          zeroBalance: true,
          emptyWorkspace: true,
          secureHttpOnlyLaxCookie: true,
          firstVisitTour: true,
          logoutAndLogin: true,
          alphaDownloadDenied: 404,
          paidAiCalls: 0,
        }
      : { stage, failureType }),
    createdTenantRemoved: cleanup,
  };
  await writeFile(
    ".runtime/review/public-registration-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
}
