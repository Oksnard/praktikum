import { expect, test, type Page } from "@playwright/test";

const ownerEmail = process.env.PLAYWRIGHT_SMOKE_OWNER_EMAIL;
const ownerPassword = process.env.PLAYWRIGHT_SMOKE_OWNER_PASSWORD;
const employeeEmail = process.env.PLAYWRIGHT_SMOKE_EMPLOYEE_EMAIL;
const employeePassword = process.env.PLAYWRIGHT_SMOKE_EMPLOYEE_PASSWORD;
const adminEmail = process.env.PLAYWRIGHT_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_SMOKE_ADMIN_PASSWORD;

async function dismissTourIfShown(page: Page) {
  const close = page.getByRole("button", { name: "Пропустить обучение" });
  await close
    .waitFor({ state: "visible", timeout: 2_500 })
    .catch(() => undefined);
  if (await close.isVisible()) await close.click();
}

test("production owner session and workspace read safely", async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "Set PLAYWRIGHT_BASE_URL to the deployed app",
  );
  test.skip(
    !ownerEmail || !ownerPassword,
    "Set production smoke owner credentials",
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail!);
  await page.getByLabel("Пароль").fill(ownerPassword!);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await dismissTourIfShown(page);
  await expect(
    page.getByRole("heading", { name: /Добро пожаловать/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Баланс и расходы" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Команда" })).toBeVisible();
});

test("production employee role sees personal learning without owner controls", async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "Set PLAYWRIGHT_BASE_URL to the deployed app",
  );
  test.skip(
    !employeeEmail || !employeePassword,
    "Set production smoke employee credentials",
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill(employeeEmail!);
  await page.getByLabel("Пароль").fill(employeePassword!);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await dismissTourIfShown(page);
  await expect(
    page.getByRole("heading", { name: "Баланс и расходы" }),
  ).toBeVisible();
  await expect(page.getByText("Ваш лимит")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Добавить материал/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Добавить в команду" }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("production platform administrator can read the ledger", async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "Set PLAYWRIGHT_BASE_URL to the deployed app",
  );
  test.skip(
    !adminEmail || !adminPassword,
    "Set production smoke administrator credentials",
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail!);
  await page.getByLabel("Пароль").fill(adminPassword!);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await dismissTourIfShown(page);
  await expect(
    page.getByRole("heading", { name: "Движение кредитов" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Операции и стоимость" }),
  ).toBeVisible();
});
