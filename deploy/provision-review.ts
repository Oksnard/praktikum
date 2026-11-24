import { PrismaClient } from "@prisma/client";
import { criteria } from "../packages/types/src";
import { hashPassword } from "../apps/api/src/auth";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const db = new PrismaClient();
async function main() {
  const output = process.env.REVIEW_CREDENTIALS_FILE;
  if (!output)
    throw new Error(
      "REVIEW_CREDENTIALS_FILE must name a private credential file",
    );
  if (await db.company.count())
    throw new Error("Refusing to provision a non-empty production database");
  const roles = ["OWNER", "MANAGER", "EMPLOYEE", "SUPER_ADMIN"] as const;
  const credentials = ["alpha", "beta"].flatMap((company) =>
    roles
      .filter((role) => company === "alpha" || role !== "SUPER_ADMIN")
      .map((role) => ({
        role,
        company,
        email: `${role.toLowerCase()}@${company}.review.praktikum.test`,
        password: randomBytes(24).toString("base64url"),
      })),
  );
  // Reserve the private output before DB writes; never print credentials or reuse public seed passwords.
  await writeFile(
    output,
    JSON.stringify(
      {
        warning: "Private application review credentials; not an API key",
        accounts: credentials,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  await db.$transaction(async (tx) => {
    for (const label of ["alpha", "beta"]) {
      const company = await tx.company.create({
        data: {
          name: `Практикум — ${label} проверка`,
          criteria,
          balance: 500000,
        },
      });
      for (const c of credentials.filter(
        (account) => account.company === label,
      ))
        await tx.user.create({
          data: {
            companyId: c.role === "SUPER_ADMIN" ? null : company.id,
            role: c.role,
            email: c.email,
            name: `${c.role} ${label}`,
            passwordHash: hashPassword(c.password),
            limit: 500000,
          },
        });
      await tx.creditTransaction.create({
        data: {
          companyId: company.id,
          amount: 500000,
          kind: "REVIEW_INITIAL",
          key: `review:${company.id}`,
        },
      });
    }
  });
  console.log(
    "Provisioned private review accounts. Credentials written only to the protected output file.",
  );
}
main().finally(() => db.$disconnect());
