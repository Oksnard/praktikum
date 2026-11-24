import { defineConfig, devices } from "@playwright/test";

const apiUrl = "http://127.0.0.1:3211";
const webUrl = "http://127.0.0.1:3200";
const remoteOnly =
  process.env.PLAYWRIGHT_REMOTE_SMOKE === "1" ||
  process.argv.some(
    (argument) =>
      argument === "production-smoke" ||
      argument === "--project=production-smoke",
  );
const gateUser = process.env.PLAYWRIGHT_GATE_USER;
const gatePassword = process.env.PLAYWRIGHT_GATE_PASSWORD;

export default defineConfig({
  testDir: "./tests/browser",
  globalTeardown: "./tests/browser/teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  globalSetup: "./tests/browser/setup.ts",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".runtime/playwright/report", open: "never" }],
  ],
  outputDir: ".runtime/playwright/results",
  webServer: remoteOnly
    ? undefined
    : [
        {
          command:
            "node --env-file=.env --import tsx apps/api/test/browser-server.ts",
          url: `${apiUrl}/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            BROWSER_E2E: "1",
            BROWSER_E2E_API_PORT: "3211",
            NODE_ENV: "test",
            ALLOW_PUBLIC_REGISTRATION: "true",
            ALLOW_MOCK_TOPUPS: "true",
          },
        },
        {
          command:
            "node --env-file=.env --import tsx tests/browser/start-web.ts",
          url: webUrl,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { API_URL: apiUrl, NODE_ENV: "development" },
        },
      ],
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "local-browser",
      testMatch: "praktikum.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: webUrl },
    },
    {
      name: "production-smoke",
      testMatch: "remote-smoke.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PLAYWRIGHT_BASE_URL,
        httpCredentials:
          gateUser && gatePassword
            ? { username: gateUser, password: gatePassword }
            : undefined,
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
  ],
});
