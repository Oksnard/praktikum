import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { LocalFileStorage } from "../apps/api/src/documents/storage.ts";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const username = process.env.PLAYWRIGHT_GATE_USER;
const password = process.env.PLAYWRIGHT_GATE_PASSWORD;
const databaseURL = new URL(process.env.DATABASE_URL ?? "");
if (!baseURL?.startsWith("https://") || !username || !password ||
    !["127.0.0.1", "localhost", "::1"].includes(databaseURL.hostname))
  throw new Error("Private HTTPS review and loopback database required");
const accounts = JSON.parse(await readFile(".runtime/review/accounts.json", "utf8")) as {
  accounts: { company: string; role: string; email: string; password: string }[];
};
const owner = accounts.accounts.find((a) => a.company === "alpha" && a.role === "OWNER");
if (!owner) throw new Error("Missing review owner");
const title = `HTTPS-UI-${randomUUID()}`;
const db = new PrismaClient();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 },
  httpCredentials: { username, password, origin: new URL(baseURL).origin } });
const page = await context.newPage();
let stage = "login";
let passed = false;
let cleanup = false;
let failureType: string | undefined;
let release: (() => void) | undefined;
try {
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Пароль").fill(owner.password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
  const close = page.getByRole("button", { name: "Пропустить обучение" });
  await close.waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);
  if (await close.isVisible()) await close.click();
  stage = "navigation";
  for (const link of await page.locator('aside.sidebar nav a[href^="#"]').all()) {
    if (!(await link.isVisible())) continue;
    const href = await link.getAttribute("href");
    if (!href || href === "#") throw new Error("Empty navigation destination");
    await expect(page.locator(href)).toHaveCount(1);
    await link.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(href);
    await expect(page.locator(href)).toBeInViewport();
  }
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Прикрепить документ" }) });
  const file = form.getByLabel("Файл материала");
  stage = "desktop upload panel and limits";
  await expect(form).toContainText("5 МиБ");
  await expect(form).toContainText("12 000");
  await expect(form).toContainText("60");
  await form.scrollIntoViewIfNeeded();
  await mkdir("docs/screenshots", { recursive: true });
  await form.screenshot({ path: "docs/screenshots/public-upload-desktop.png" });
  await form.getByLabel("Название документа").fill(title);
  await file.setInputFiles("apps/api/test/document-fixtures/scan.pdf");
  await expect(form.locator(".material-file-selected")).toContainText("scan.pdf");
  stage = "real scanned PDF rejection";
  await form.getByRole("button", { name: "Загрузить документ", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("60", { timeout: 20000 });
  stage = "mobile selected file and error reset";
  await page.setViewportSize({ width: 390, height: 844 });
  await file.setInputFiles("apps/api/test/document-fixtures/russian.docx");
  await expect(form.locator(".material-file-selected")).toContainText("russian.docx");
  await expect(form.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const replay = page.getByRole("button", { name: "Запустить обучение снова" });
  const submit = form.getByRole("button", { name: "Загрузить документ", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(replay).toBeInViewport({ ratio: 1 });
  await expect(submit).toBeInViewport({ ratio: 1 });
  const replayBox = await replay.boundingBox();
  const submitBox = await submit.boundingBox();
  if (!replayBox || !submitBox) throw new Error("Missing mobile control bounds");
  expect(replayBox.x + replayBox.width <= submitBox.x ||
    submitBox.x + submitBox.width <= replayBox.x ||
    replayBox.y + replayBox.height <= submitBox.y ||
    submitBox.y + submitBox.height <= replayBox.y).toBe(true);
  await form.screenshot({ path: "docs/screenshots/public-upload-mobile.png" });
  stage = "pending state before forwarding actual upload";
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/materials/upload", async (route) => {
    await hold;
    await route.continue();
  }, { times: 1 });
  await form.getByRole("button", { name: "Загрузить документ", exact: true }).click();
  await expect(form.getByRole("button", { name: "Извлекаем текст…", exact: true })).toBeDisabled();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(form.getByLabel("Название документа")).toBeDisabled();
  await expect(file).toBeDisabled();
  release!();
  stage = "real DOCX success and form reset";
  const card = page.locator(".material-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toContainText("Перед встречей сотрудник изучает запрос клиента.", { timeout: 20000 });
  await expect(form.getByLabel("Название документа")).toHaveValue("");
  await expect(file).toHaveValue("");
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expect(form.getByLabel("Название документа")).toBeEnabled();
  await expect(file).toBeEnabled();
  await expect(form.locator(".material-file-selected")).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Загрузить документ", exact: true })).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20000 });
  passed = true;
} catch (error) {
  failureType = error instanceof Error ? error.name : "unknown";
} finally {
  release?.();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: owner.email } });
    if (!user.companyId) throw new Error("Missing cleanup tenant");
    const materials = await db.material.findMany({ where: { companyId: user.companyId, title } });
    const storage = new LocalFileStorage();
    for (const material of materials) {
      // No generation is invoked; refuse to remove a material used by another action.
      if (await db.assignment.count({ where: { materialId: material.id } }))
        throw new Error("Unexpected assignment prevents cleanup");
      if (material.attachmentKey) await storage.remove(material.attachmentKey);
      await db.material.delete({ where: { id: material.id } });
    }
    cleanup = (await db.material.count({ where: { companyId: user.companyId, title } })) === 0;
    const cookie = (await context.cookies()).find((item) => item.name === "praktikum_session");
    if (cookie) await fetch("http://127.0.0.1:3311/auth/logout", {
      method: "POST", headers: { Authorization: `Bearer ${cookie.value}` },
    });
  } catch { cleanup = false; }
  await context.close();
  await browser.close();
  await db.$disconnect();
  const result = { status: passed && cleanup ? "PASS" : "FAIL", url: baseURL,
    checkedAt: new Date().toISOString(),
    ...(passed ? { ownerNavigation: true, desktopPanel: true, mobile390px: true,
      selectedFilename: true, scanRejection: true, pendingDisabled: true,
      inputsDisabledWhilePending: true, ariaBusy: true, replaySubmitNoOverlap: true,
      realDocxUpload: true, successReset: true, paidAiCalls: 0 } : { stage, failureType }),
    uploadedMaterialRemoved: cleanup };
  await writeFile(".runtime/review/public-upload-ui-result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
}
