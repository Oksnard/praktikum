import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dashboard } from "@praktikum/types";

type QaDashboard = Omit<Dashboard, "attempts"> & {
  attempts: (Dashboard["attempts"][number] & { assignmentId: string })[];
};

type QaUser = { id: string; email: string; password: string };
type QaState = {
  companyId: string;
  directory: string;
  materialId: string;
  assignmentId: string;
  owner: QaUser;
  employee: QaUser;
};
type Evaluation = {
  score: number;
  criteria: { id: string; score: number; explanation: string }[];
  evidence: string[];
  gaps: string[];
  unsupported_claims: string[];
  feedback: string;
  recommendations: string[];
  personal_material: string;
};
type ResultFile = {
  attempt: {
    id: string;
    companyId: string;
    assignmentId: string;
    userId: string;
    answer: string;
  };
  evaluation: Evaluation;
};

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const gateUser = process.env.PLAYWRIGHT_GATE_USER;
const gatePassword = process.env.PLAYWRIGHT_GATE_PASSWORD;
const apiOrigin = "http://127.0.0.1:3311";
const accessPath = ".runtime/ai-quality-assessment-v2/access.json";
const legacyPath = ".runtime/ai-quality-assessment/access.json";
if (!baseURL?.startsWith("https://") || !gateUser || !gatePassword) {
  throw new Error("Private public-review HTTPS configuration required");
}

const current = JSON.parse(await readFile(accessPath, "utf8")) as QaState;
const legacy = JSON.parse(await readFile(legacyPath, "utf8")) as QaState;
const labels: Record<string, string> = {
  accuracy: "Точность",
  completeness: "Полнота",
  application: "Применение",
};
const names = ["full", "partial", "unsafe"] as const;
const results = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => {
      const file = path.join(
        current.directory,
        "policy5",
        `result-${name}.json`,
      );
      const result = JSON.parse(await readFile(file, "utf8")) as ResultFile;
      expect(result.attempt.companyId).toBe(current.companyId);
      expect(result.attempt.userId).toBe(current.employee.id);
      expect(result.attempt.assignmentId).toBe(current.assignmentId);
      return [name, result] as const;
    }),
  ),
) as Record<(typeof names)[number], ResultFile>;
expect(results.full.evaluation.score).toBe(100);
expect(results.partial.evaluation.score).toBe(72);
expect(results.unsafe.evaluation.score).toBe(8);

const browser = await chromium.launch({ headless: true });
const contexts: BrowserContext[] = [];
const sessionTokens = new Set<string>();
let stage = "setup";
let failureType: string | undefined;
let passed = false;
const view = async (viewport = { width: 1280, height: 900 }) => {
  const context = await browser.newContext({
    baseURL,
    viewport,
    httpCredentials: {
      username: gateUser!,
      password: gatePassword!,
      origin: new URL(baseURL!).origin,
    },
  });
  contexts.push(context);
  return context;
};
const login = async (page: Page, account: QaUser) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Пароль").fill(account.password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === "praktikum_session",
  );
  if (cookie?.value) sessionTokens.add(cookie.value);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
};
const dismissTour = async (page: Page) => {
  const close = page.getByRole("button", { name: "Пропустить обучение" });
  await close
    .waitFor({ state: "visible", timeout: 3000 })
    .catch(() => undefined);
  if (await close.isVisible()) await close.click();
};
const api = async (token: string, route: string, body?: unknown) => {
  return fetch(`${apiOrigin}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
};
const sessionFrom = async (context: BrowserContext) => {
  const cookie = (await context.cookies()).find(
    (item) => item.name === "praktikum_session",
  );
  expect(cookie?.value).toBeTruthy();
  return cookie!.value;
};
const dashboard = async (token: string): Promise<QaDashboard> => {
  const response = await api(token, "/dashboard");
  expect(response.status).toBe(200);
  return (await response.json()) as QaDashboard;
};

try {
  stage = "employee accepted result cards";
  const employeeContext = await view();
  const employee = await employeeContext.newPage();
  await login(employee, current.employee);
  await dismissTour(employee);
  for (const name of names) {
    stage = `employee ${name} card visible`;
    const result = results[name];
    const card = employee.locator(
      `.result-card[data-attempt-id="${result.attempt.id}"]`,
    );
    await expect(card).toBeVisible();
    stage = `employee ${name} score and criteria`;
    await expect(card.locator(".score")).toContainText(
      String(result.evaluation.score),
    );
    await expect(
      card.locator(".criteria-breakdown .criterion-line"),
    ).toHaveCount(result.evaluation.criteria.length);
    for (const criterion of result.evaluation.criteria) {
      await expect(card.locator(".criteria-breakdown")).toContainText(
        labels[criterion.id] ?? criterion.id,
      );
      await expect(card.locator(".criteria-breakdown")).toContainText(
        `${criterion.score} баллов`,
      );
      await expect(card.locator(".criteria-breakdown")).toContainText(
        criterion.explanation,
      );
    }
    stage = `employee ${name} evidence quotes`;
    for (const quote of result.evaluation.evidence) {
      await expect(card.locator(".result-evidence")).toContainText(quote);
    }
    stage = `employee ${name} recommendations`;
    for (const recommendation of result.evaluation.recommendations) {
      await expect(card.locator(".recommendation")).toContainText(
        recommendation,
      );
    }
    await expect(card.locator(".recommendation")).toContainText(
      result.evaluation.personal_material,
    );
    stage = `employee ${name} gaps`;
    const gapPanel = card
      .locator(".gap-breakdown")
      .filter({ hasText: "Что стоит подтянуть" });
    for (const gap of result.evaluation.gaps) {
      await expect(gapPanel).toContainText(gap);
    }
    stage = `employee ${name} unsupported claims`;
    const claimsPanel = card
      .locator(".gap-breakdown")
      .filter({ hasText: "Что не подтвердилось в материале" });
    for (const claim of result.evaluation.unsupported_claims) {
      await expect(claimsPanel).toContainText(claim);
    }
    stage = `employee ${name} screenshot`;
    const header = employee.locator("header.topbar");
    const initialCardBox = await card.boundingBox();
    const headerBox = await header.boundingBox();
    if (!initialCardBox || !headerBox)
      throw new Error("Missing report capture geometry");
    const marginTop = Math.ceil(headerBox.height) + 24;
    await employee.setViewportSize({
      width: 1280,
      height: Math.max(900, Math.ceil(initialCardBox.height) + marginTop + 80),
    });
    await card.evaluate((element, top) => {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - top,
        behavior: "instant",
      });
    }, marginTop);
    await expect(card).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => {
        const box = await card.boundingBox();
        const sticky = await header.boundingBox();
        return !!box && !!sticky && box.y >= sticky.y + sticky.height;
      })
      .toBe(true);
    await card.screenshot({
      path: `docs/screenshots/ai-quality-${name}.png`,
      animations: "disabled",
    });
  }
  stage = "employee desktop layout width";
  expect(
    await employee.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  stage = "employee mobile layout width";
  await employee.setViewportSize({ width: 390, height: 844 });
  expect(
    await employee.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  stage = "owner accepted current full-result detail";
  const ownerContext = await view();
  const owner = await ownerContext.newPage();
  await login(owner, current.owner);
  await dismissTour(owner);
  const full = results.full;
  const fullRow = owner.locator(
    `#results tr[data-attempt-id="${full.attempt.id}"]`,
  );
  await expect(fullRow).toBeVisible();
  await expect(fullRow.locator(".score")).toContainText("100");
  await fullRow.getByText("Разбор", { exact: true }).click();
  const detail = fullRow.locator("details[open] .detail-pop");
  await expect(detail).toContainText(full.attempt.answer);
  await expect(detail).toContainText(full.evaluation.feedback);
  await expect(detail).toContainText("Критерии оценки");
  await expect(detail).toContainText("Опора на материал");
  await expect(detail).toContainText("Что подтянуть");
  for (const criterion of full.evaluation.criteria) {
    await expect(detail).toContainText(labels[criterion.id] ?? criterion.id);
    await expect(detail).toContainText(criterion.explanation);
  }
  for (const quote of full.evaluation.evidence) {
    await expect(detail).toContainText(quote);
  }

  stage = "legacy assignment update path and readonly employee";
  const legacyOwnerContext = await view();
  const legacyOwner = await legacyOwnerContext.newPage();
  await login(legacyOwner, legacy.owner);
  await dismissTour(legacyOwner);
  const legacyOwnerToken = await sessionFrom(legacyOwnerContext);
  const ownerData = await dashboard(legacyOwnerToken);
  stage = "legacy owner tenant match";
  expect(ownerData.company?.id).toBe(legacy.companyId);
  const legacyMaterial = ownerData.materials.find(
    (material) => material.id === legacy.materialId,
  );
  stage = "legacy owner material lookup";
  expect(legacyMaterial).toBeTruthy();
  const materialTitle = legacyMaterial!.title;
  const ownerMaterialCard = legacyOwner.locator(".material-card").filter({
    has: legacyOwner.getByRole("heading", {
      name: materialTitle,
      exact: true,
    }),
  });
  stage = "legacy owner material card and update action";
  await expect(ownerMaterialCard).toBeVisible();
  await expect(
    ownerMaterialCard.getByRole("button", {
      name: "Обновить задание",
      exact: true,
    }),
  ).toBeVisible();

  const legacyEmployeeContext = await view();
  const legacyEmployee = await legacyEmployeeContext.newPage();
  await login(legacyEmployee, legacy.employee);
  await dismissTour(legacyEmployee);
  const legacyEmployeeToken = await sessionFrom(legacyEmployeeContext);
  const before = await dashboard(legacyEmployeeToken);
  expect(before.company?.id).toBe(legacy.companyId);
  expect(before.user.id).toBe(legacy.employee.id);
  const legacyEmployeeCard = legacyEmployee.locator(".material-card").filter({
    has: legacyEmployee.getByRole("heading", {
      name: materialTitle,
      exact: true,
    }),
  });
  await expect(legacyEmployeeCard).toBeVisible();
  stage = "legacy employee task warning and historical result labels";
  await expect(legacyEmployeeCard).toContainText("Прежнее задание:");
  await expect(legacyEmployeeCard).toContainText("Это задание нужно обновить.");
  const historicalAttempts = before.attempts.filter(
    (attempt) => attempt.assignmentId === legacy.assignmentId,
  );
  expect(historicalAttempts.length).toBeGreaterThan(0);
  for (const attempt of historicalAttempts) {
    await expect(
      legacyEmployee.locator(`.result-card[data-attempt-id="${attempt.id}"]`),
    ).toContainText("Предыдущая методика");
  }
  await expect(legacyEmployeeCard).toContainText("Попросите владельца");
  await expect(legacyEmployeeCard.getByLabel("Ваш ответ")).toHaveCount(0);

  stage = "legacy answer rejection without billing or persistence";
  const beforeOwner = await dashboard(legacyOwnerToken);
  const beforeOperations = beforeOwner.operations.map((row) => row.id).sort();
  const beforeTransactions = beforeOwner.transactions
    .map((row) => row.id)
    .sort();
  const rejected = await api(
    legacyEmployeeToken,
    `/assignments/${legacy.assignmentId}/attempts`,
    { answer: "Проверочный ответ на устаревшее задание без запуска оценки." },
  );
  expect(rejected.status).toBe(409);
  const after = await dashboard(legacyEmployeeToken);
  expect(after.company?.balance).toBe(before.company?.balance);
  expect(after.user.spent).toBe(before.user.spent);
  const afterOwner = await dashboard(legacyOwnerToken);
  expect(afterOwner.company?.balance).toBe(beforeOwner.company?.balance);
  expect(
    afterOwner.users
      .map(({ id, spent }) => ({ id, spent }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  ).toEqual(
    beforeOwner.users
      .map(({ id, spent }) => ({ id, spent }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(afterOwner.operations.map((row) => row.id).sort()).toEqual(
    beforeOperations,
  );
  expect(afterOwner.transactions.map((row) => row.id).sort()).toEqual(
    beforeTransactions,
  );
  expect(afterOwner.attempts.map((row) => row.id).sort()).toEqual(
    beforeOwner.attempts.map((row) => row.id).sort(),
  );
  passed = true;
} catch (error) {
  failureType = error instanceof Error ? error.name : "unknown";
} finally {
  for (const token of sessionTokens) {
    try {
      const response = await api(token, "/auth/logout", {});
      if (!response.ok) throw new Error("Logout failed");
    } catch {
      passed = false;
      stage = "session revocation";
      failureType = "CleanupError";
    }
  }
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  const summary = {
    status: passed ? "PASS" : "FAIL",
    checkedAt: new Date().toISOString(),
    publicOrigin: baseURL,
    ...(passed
      ? {
          employeeScores: {
            full: results.full.evaluation.score,
            partial: results.partial.evaluation.score,
            unsafe: results.unsafe.evaluation.score,
          },
          employeeCriteriaEvidenceRecommendations: true,
          screenshots: [
            "docs/screenshots/ai-quality-full.png",
            "docs/screenshots/ai-quality-partial.png",
            "docs/screenshots/ai-quality-unsafe.png",
          ],
          employeeMobile390NoOverflow: true,
          ownerCurrentFullResult: true,
          reportCapturesBelowStickyHeader: true,
          sessionsRevoked: true,
          legacyOwnerUpdateActionVisible: true,
          legacyEmployeeReadonlyAndMarked: true,
          legacySubmissionStatus: 409,
          rejectedSubmissionNoBalanceSpendLedgerOrAttemptChange: true,
          aiCalls: 0,
        }
      : { stage, failureType }),
  };
  await mkdir(".runtime/review", { recursive: true });
  await writeFile(
    ".runtime/review/quality-ui-result.json",
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!passed) process.exitCode = 1;
}
