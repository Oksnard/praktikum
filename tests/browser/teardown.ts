import { PrismaClient } from "@prisma/client";

export default async function globalTeardown() {
  const remoteSmoke =
    process.env.PLAYWRIGHT_REMOTE_SMOKE === "1" ||
    process.argv.some((arg) => arg.includes("production-smoke"));
  if (process.env.BROWSER_E2E !== "1" || remoteSmoke) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) {
    throw new Error(
      "Refusing browser test cleanup outside loopback PostgreSQL",
    );
  }
  const db = new PrismaClient();
  try {
    const fixtureAdminEmail = "pw-e2e-superadmin@example.test";
    await db.session.deleteMany({
      where: { user: { email: fixtureAdminEmail } },
    });
    await db.user.deleteMany({ where: { email: fixtureAdminEmail } });
    const companies = await db.company.findMany({
      where: { name: { startsWith: "PW-E2E-" } },
      select: { id: true },
    });
    for (const { id } of companies) {
      const attachments = await db.material.findMany({
        where: { companyId: id, attachmentKey: { not: null } },
        select: { attachmentKey: true },
      });
      const uploads = new (
        await import("../../apps/api/src/documents/storage")
      ).LocalFileStorage();
      for (const file of attachments) {
        if (file.attachmentKey)
          await uploads.remove(file.attachmentKey).catch(() => undefined);
      }
      const users = await db.user.findMany({
        where: { companyId: id },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.attempt.deleteMany({ where: { companyId: id } });
      await db.assignment.deleteMany({ where: { companyId: id } });
      await db.material.deleteMany({ where: { companyId: id } });
      await db.aiCall.deleteMany({ where: { companyId: id } });
      await db.aiOperation.deleteMany({ where: { companyId: id } });
      await db.notification.deleteMany({ where: { companyId: id } });
      await db.creditTransaction.deleteMany({ where: { companyId: id } });
      await db.user.deleteMany({ where: { companyId: id } });
      await db.company.deleteMany({ where: { id } });
    }
  } finally {
    await db.$disconnect();
  }
}
