import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const email = "pw-e2e-superadmin@example.test";
const password = "BrowserFixtureAdmin123!";
function passwordHash(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}

export default async function globalSetup() {
  const remoteSmoke =
    process.env.PLAYWRIGHT_REMOTE_SMOKE === "1" ||
    process.argv.some((arg) => arg.includes("production-smoke"));
  if (process.env.BROWSER_E2E !== "1" || remoteSmoke) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("Refusing browser test setup outside loopback PostgreSQL");
  }
  const db = new PrismaClient();
  try {
    await db.session.deleteMany({ where: { user: { email } } });
    await db.user.upsert({
      where: { email },
      create: {
        email,
        name: "Playwright test administrator",
        role: "SUPER_ADMIN",
        passwordHash: passwordHash(password),
        spent: 0,
        limit: 0,
      },
      update: {
        name: "Playwright test administrator",
        role: "SUPER_ADMIN",
        passwordHash: passwordHash(password),
        companyId: null,
      },
    });
  } finally {
    await db.$disconnect();
  }
}
