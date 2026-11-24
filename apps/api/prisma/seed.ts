import { PrismaClient } from "@prisma/client";
import { criteria } from "@praktikum/types";
import { hashPassword } from "../src/auth";
const db = new PrismaClient();
async function seed() {
  for (const name of ["Альфа", "Бета"]) {
    const id = name === "Альфа" ? "demo-alpha" : "demo-beta";
    await db.company.upsert({
      where: { id },
      update: {},
      create: { id, name, balance: 1000000, criteria },
    });
    for (const role of ["OWNER", "MANAGER", "EMPLOYEE"]) {
      const email = `${role.toLowerCase()}@${name === "Альфа" ? "alpha" : "beta"}.test`;
      await db.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: `${role} ${name}`,
          companyId: id,
          role,
          passwordHash: hashPassword("Praktikum2026!"),
          limit: 1000000,
        },
      });
    }
    await db.creditTransaction.upsert({
      where: { key: `seed:${id}` },
      update: {},
      create: {
        companyId: id,
        amount: 1000000,
        kind: "DEMO_SEED",
        key: `seed:${id}`,
      },
    });
    await db.material.upsert({
      where: { id: `material-${id}` },
      update: {},
      create: {
        id: `material-${id}`,
        companyId: id,
        title: "Работа с обращениями клиентов",
        text: "Сотрудник должен зарегистрировать обращение клиента в CRM. В течение двух часов он подтверждает получение обращения. Если решение требует больше одного рабочего дня, сотрудник передаёт обращение руководителю и сообщает клиенту срок следующего ответа. Нельзя обещать возврат средств до согласования с руководителем.",
      },
    });
  }
  await db.user.upsert({
    where: { email: "admin@praktikum.test" },
    update: {},
    create: {
      email: "admin@praktikum.test",
      name: "Администратор платформы",
      role: "SUPER_ADMIN",
      passwordHash: hashPassword("Praktikum2026!"),
    },
  });
  console.log(
    "Seed ready: demo alpha/beta roles, admin; password documented in README.",
  );
}
seed().finally(() => db.$disconnect());
