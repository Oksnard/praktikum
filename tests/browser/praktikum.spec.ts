import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { AI_RESERVE_CREDITS } from "../../packages/types/dist/index.js";

const tag = randomUUID().slice(0, 8);
const password = "BrowserStrongPass123!";
const alpha = {
  name: `PW-E2E-${tag}-Alpha`,
  owner: `pw-e2e-${tag}-owner@example.test`,
  employee: `pw-e2e-${tag}-employee@example.test`,
  manager: `pw-e2e-${tag}-manager@example.test`,
  secondOwner: `pw-e2e-${tag}-other@example.test`,
};
const materialTitle = `Порядок обращений ${tag}`;
const materialText =
  "Сотрудник регистрирует обращение в CRM. Подтверждение получения отправляется в течение двух часов. Если решение занимает более одного рабочего дня, обращение передаётся руководителю. Возврат средств требует согласования руководителя.";
const submittedAnswer =
  "Зарегистрирую обращение клиента в CRM, подтвержу получение в течение двух часов и передам руководителю, если решение занимает более одного рабочего дня.";

async function login(page: Page, email: string, userPassword = password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(userPassword);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)$/);
  await dismissTourIfShown(page);
}

async function dismissTourIfShown(page: Page) {
  const close = page.getByRole("button", { name: "Пропустить обучение" });
  await close
    .waitFor({ state: "visible", timeout: 2_500 })
    .catch(() => undefined);
  if (await close.isVisible()) await close.click();
}

async function logout(page: Page) {
  await page.getByTitle("Выйти").click();
  await expect(page).toHaveURL(/\/login$/);
}

async function checkSidebarNavigation(page: Page, role: "OWNER" | "MANAGER" | "EMPLOYEE") {
  const navigation = page.locator("aside.sidebar nav");
  const employee = role === "EMPLOYEE";
  await expect(navigation.getByRole("link", {
    name: employee ? "Моё обучение" : "Результаты команды",
  })).toHaveAttribute("href", employee ? "#learning" : "#results");
  await expect(navigation.getByRole("link", {
    name: employee ? "Результаты команды" : "Моё обучение",
  })).toHaveCount(0);
  const links = navigation.locator('a[href^="#"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    if (!(await link.isVisible())) continue;
    const href = await link.getAttribute("href");
    if (!href || href === "#") throw new Error("Empty sidebar destination");
    const target = page.locator(href);
    await expect(target).toHaveCount(1);
    await link.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(href);
    await expect(target).toBeInViewport();
  }
}

test("основной путь обучения, роли, пределы доступа и учёт расходов", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Тестовый владелец");
  await page.getByLabel("Название компании").fill(alpha.name);
  await page.getByLabel("Рабочий email").fill(alpha.owner);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Создать компанию/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await dismissTourIfShown(page);
  await expect(page.getByRole("heading", { name: "Команда" })).toBeVisible();
  await checkSidebarNavigation(page, "OWNER");

  await page.locator("#topup-amount").fill("500000");
  await page.getByRole("button", { name: /Пополнить баланс/ }).click();
  await expect(page.getByText("Пополнение (Demo)")).toBeVisible();

  await page.getByLabel("Название материала").fill(materialTitle);
  await page.getByLabel("Содержание").fill(materialText);
  await page.getByRole("button", { name: /Добавить материал/ }).click();
  await expect(
    page.getByRole("heading", { name: materialTitle }),
  ).toBeVisible();
  await expect(page.getByText(materialText)).toBeVisible();

  await page.getByLabel("Название документа").fill(`DOCX ${tag}`);
  await page
    .getByLabel("Файл материала")
    .setInputFiles("apps/api/test/document-fixtures/russian.docx");
  await page.getByRole("button", { name: "Загрузить документ" }).click();
  await expect(
    page.getByRole("heading", { name: `DOCX ${tag}` }),
  ).toBeVisible();
  await expect(
    page.getByText("Перед встречей сотрудник изучает запрос клиента.", {
      exact: false,
    }),
  ).toBeVisible();
  const downloadedDocument = await page
    .getByRole("link", { name: "Скачать russian.docx" })
    .getAttribute("href");
  if (!downloadedDocument)
    throw new Error("Uploaded file download link missing");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Скачать russian.docx" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("russian.docx");

  await page.getByLabel("Название документа").fill(`PDF ${tag}`);
  await page
    .getByLabel("Файл материала")
    .setInputFiles("apps/api/test/document-fixtures/russian.pdf");
  await page.getByRole("button", { name: "Загрузить документ" }).click();
  await expect(page.getByRole("heading", { name: `PDF ${tag}` })).toBeVisible();
  await expect(
    page
      .locator(".material-card")
      .filter({ has: page.getByRole("heading", { name: `PDF ${tag}` }) })
      .getByText("После встречи он записывает договорённости в систему", {
        exact: false,
      }),
  ).toBeVisible();

  await page.getByLabel("Название документа").fill(`Скан без OCR ${tag}`);
  await page
    .getByLabel("Файл материала")
    .setInputFiles("apps/api/test/document-fixtures/scan.pdf");
  await page.getByRole("button", { name: "Загрузить документ" }).click();
  await expect(page.locator(".material-form [role=alert]")).toContainText(
    "не менее 60 символов",
  );
  await page
    .locator(".material-card")
    .filter({ has: page.getByRole("heading", { name: materialTitle }) })
    .getByRole("button", { name: /Создать задание/ })
    .click();
  await expect(page.getByText("Порядок работы с клиентом")).toBeVisible();

  await page
    .getByLabel("Имя", { exact: true })
    .fill("Сотрудник браузерного теста");
  await page.getByLabel("Email", { exact: true }).last().fill(alpha.employee);
  await page.getByLabel("Пароль", { exact: true }).last().fill(password);
  await page.getByLabel("Лимит, кредитов").fill(String(AI_RESERVE_CREDITS * 3));
  await page.getByRole("button", { name: "Добавить в команду" }).click();
  await expect(page.getByText(alpha.employee)).toBeVisible();

  await page
    .getByLabel("Имя", { exact: true })
    .fill("Руководитель браузерного теста");
  await page.getByLabel("Email", { exact: true }).last().fill(alpha.manager);
  await page.getByLabel("Пароль", { exact: true }).last().fill(password);
  await page.getByRole("combobox", { name: /Роль/ }).selectOption("MANAGER");
  await page.getByLabel("Лимит, кредитов").fill(String(AI_RESERVE_CREDITS * 3));
  await page.getByRole("button", { name: "Добавить в команду" }).click();
  await expect(page.getByText(alpha.manager)).toBeVisible();

  await logout(page);
  await login(page, alpha.employee);
  await checkSidebarNavigation(page, "EMPLOYEE");
  await expect(
    page.getByRole("heading", { name: materialTitle }),
  ).toBeVisible();
  await expect(page.getByText(materialText)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `DOCX ${tag}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Прикрепить документ" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Создать задание/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Добавить в команду" }),
  ).toHaveCount(0);
  await expect(page.getByText("Ваш лимит")).toBeVisible();
  await page.getByLabel("Ваш ответ").fill(submittedAnswer);
  await page.getByRole("button", { name: "Отправить на оценку" }).click();
  await expect(
    page.getByRole("heading", { name: "Мои результаты" }),
  ).toBeVisible();
  await expect(page.locator(".result-card .score")).toContainText("100");
  await expect(page.getByText("Точность по источнику")).toBeVisible();
  await expect(
    page
      .locator(".result-card .result-evidence")
      .getByText("Сотрудник регистрирует обращение в CRM.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Повторите порядок регистрации и эскалации обращения."),
  ).toBeVisible();
  await expect(page.getByText(/кредитов доступно/)).toBeVisible();

  await logout(page);
  await login(page, alpha.manager);
  await checkSidebarNavigation(page, "MANAGER");
  await expect(
    page.getByRole("heading", { name: "Результаты команды" }),
  ).toBeVisible();
  await expect(page.getByText(alpha.employee)).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: alpha.employee }).locator(".score"),
  ).toContainText("100");
  await page.getByText("Разбор", { exact: true }).click();
  await expect(page.getByText(submittedAnswer)).toBeVisible();
  await expect(page.getByText("Точность по источнику")).toBeVisible();
  await expect(
    page
      .locator(".detail-pop")
      .getByText("Сотрудник регистрирует обращение в CRM.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить в команду" }),
  ).toHaveCount(0);
  await logout(page);

  await login(page, alpha.owner);
  await expect(page.locator(".usage-card .usage-row")).toHaveCount(2);
  const employeeRow = page.getByRole("row").filter({ hasText: alpha.employee });
  await employeeRow
    .locator('input[name="limit"]')
    .fill(String(AI_RESERVE_CREDITS));
  await employeeRow.getByRole("button", { name: "Сохранить" }).click();

  await logout(page);
  await login(page, alpha.employee);
  await page
    .getByLabel("Ваш ответ")
    .fill(
      `${submittedAnswer} Дополнительный новый ответ для проверки личного лимита.`,
    );
  await page.getByRole("button", { name: "Отправить на оценку" }).click();
  await expect(page.locator(".action-alert[role=alert]")).toContainText(
    /лимит|бюджет|кредитов/i,
  );
  await expect(
    page.getByRole("heading", { name: materialTitle }),
  ).toBeVisible();
  await expect(page.getByText("Мои результаты")).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Войти в Практикум" }),
  ).toBeVisible();

  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Владелец другой компании");
  await page.getByLabel("Название компании").fill(`PW-E2E-${tag}-Other`);
  await page.getByLabel("Рабочий email").fill(alpha.secondOwner);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Создать компанию/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await dismissTourIfShown(page);
  await expect(
    page.locator("#materials").getByText("Начните с первого материала", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(materialTitle)).toHaveCount(0);
  const crossTenantDownload = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return response.status;
  }, downloadedDocument);
  expect(crossTenantDownload).toBe(404);
});

test("ошибка входа остаётся в форме, неавторизованные перенаправляются", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`missing-${tag}@example.test`);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page.locator(".action-alert[role=alert]")).toContainText(
    "Неверный email или пароль",
  );
  await expect(
    page.getByRole("heading", { name: "Войти в Практикум" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("обучение запускается один раз, повторяется и пропускает разделы роли", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const ownerEmail = `pw-e2e-${tag}-tour-owner@example.test`;
  const employeeEmail = `pw-e2e-${tag}-tour-employee@example.test`;
  const dialog = page.getByRole("dialog");

  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Владелец обучения");
  await page.getByLabel("Название компании").fill(`PW-E2E-${tag}-Tour`);
  await page.getByLabel("Рабочий email").fill(ownerEmail);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Создать компанию/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1 из 5")).toBeVisible();
  await expect(
    dialog.getByText("Добро пожаловать в Практикум", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await expect(
    dialog.getByText("Материалы и задания", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Назад" }).click();
  await expect(dialog.getByText("1 из 5")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(500);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Запустить обучение снова" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1 из 5")).toBeVisible();
  await dialog.getByRole("button", { name: "Пропустить обучение" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByLabel("Имя", { exact: true }).fill("Участник обучения");
  await page.getByLabel("Email", { exact: true }).fill(employeeEmail);
  await page.getByLabel("Пароль", { exact: true }).last().fill(password);
  await page.getByLabel("Лимит, кредитов").fill(String(AI_RESERVE_CREDITS * 3));
  await page.getByRole("button", { name: "Добавить в команду" }).click();
  await expect(page.getByText(employeeEmail)).toBeVisible();
  await logout(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(employeeEmail);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1 из 4")).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await expect(
    dialog.getByText("Ваш результат", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("3 из 4")).toBeVisible();
  await expect(dialog.getByText("Результаты команды")).toHaveCount(0);
  await expect(dialog.getByText("Команда и личные лимиты")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("SUPER_ADMIN видит общий журнал платформы", async ({ page }) => {
  await login(
    page,
    "pw-e2e-superadmin@example.test",
    "BrowserFixtureAdmin123!",
  );
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Общий обзор" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Движение кредитов" }),
  ).toBeVisible();
  const companies = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Компании и балансы" }),
  });
  await expect(
    companies.getByRole("cell", { name: "Альфа", exact: true }),
  ).toBeVisible();
  await logout(page);
});

test("мобильная ширина сохраняет выход и не расширяет страницу", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Мобильный владелец");
  await page.getByLabel("Название компании").fill(`PW-E2E-${tag}-Mobile`);
  await page
    .getByLabel("Рабочий email")
    .fill(`pw-e2e-${tag}-mobile@example.test`);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Создать компанию/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const dialog = page.getByRole("dialog");
  for (let step = 1; step <= 5; step += 1) {
    await expect(dialog.getByText(`${step} из 5`)).toBeVisible();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(
      dialog.getByRole("button", { name: "Пропустить обучение" }),
    ).toBeInViewport({ ratio: 1 });
    const next = dialog.getByRole("button", {
      name: step === 5 ? "Готово" : "Далее",
    });
    await expect(next).toBeInViewport({ ratio: 1 });
    await next.click();
  }
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Выйти из аккаунта" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.innerWidth);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
