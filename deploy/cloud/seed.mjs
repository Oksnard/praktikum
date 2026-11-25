import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { hashPassword } = require("../../apps/api/dist/src/auth.js");
const { criteria } = require("../../packages/types/dist/index.js");
export function reviewAccounts(json) {
  let accounts;
  try {
    accounts = JSON.parse(json);
  } catch {
    throw new Error("Invalid private review account configuration");
  }
  if (!Array.isArray(accounts) || accounts.length !== 7)
    throw new Error("Seven private review identities required");
  const expected = new Set([
    "alpha:OWNER",
    "alpha:MANAGER",
    "alpha:EMPLOYEE",
    "alpha:SUPER_ADMIN",
    "beta:OWNER",
    "beta:MANAGER",
    "beta:EMPLOYEE",
  ]);
  const emails = new Set();
  for (const a of accounts) {
    if (
      !a ||
      !expected.delete(`${a.company}:${a.role}`) ||
      typeof a.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) ||
      emails.has(a.email.toLowerCase()) ||
      typeof a.password !== "string" ||
      a.password.length < 20
    )
      throw new Error("Invalid private review identity");
    emails.add(a.email.toLowerCase());
  }
  return accounts;
}
export async function provisionCloud(db, accounts) {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(21470625)`;
      const existing = await tx.user.findMany({
        select: { email: true, role: true, companyId: true },
      });
      const companyCount = await tx.company.count();
      if (existing.length || companyCount) {
        // Other registered users are allowed after initial provision; never reset balances/passwords.
        for (const a of accounts) {
          const found = existing.find((u) => u.email === a.email.toLowerCase());
          if (
            !found ||
            found.role !== a.role ||
            found.companyId !==
              (a.role === "SUPER_ADMIN" ? null : `render-review-${a.company}`)
          )
            throw new Error(
              "Existing database does not match cloud review identities",
            );
        }
        return;
      }
      for (const company of ["alpha", "beta"]) {
        const id = `render-review-${company}`;
        await tx.company.create({
          data: {
            id,
            name: `Практикум — cloud ${company}`,
            criteria,
            balance: 500000,
          },
        });
        await tx.creditTransaction.create({
          data: {
            companyId: id,
            amount: 500000,
            kind: "REVIEW_INITIAL",
            key: `cloud-review:${company}`,
          },
        });
      }
      for (const a of accounts)
        await tx.user.create({
          data: {
            companyId:
              a.role === "SUPER_ADMIN" ? null : `render-review-${a.company}`,
            role: a.role,
            email: a.email.toLowerCase(),
            name: `${a.role} ${a.company}`,
            passwordHash: hashPassword(a.password),
            limit: 500000,
          },
        });
    },
    { timeout: 30000 },
  );
}
export async function seedFromEnvironment(env) {
  const accounts = reviewAccounts(env.REVIEW_ACCOUNTS_JSON);
  const db = new PrismaClient();
  try {
    await provisionCloud(db, accounts);
  } finally {
    await db.$disconnect();
  }
}
