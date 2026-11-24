import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  criteria,
  RegisterSchema,
  LoginSchema,
  MaterialSchema,
  UserSchema,
  AnswerSchema,
  TopUpSchema,
  LimitSchema,
} from "@praktikum/types";
import { z } from "zod/v3";
import { Repository } from "./repository";
import { digest, hashPassword, tenant, userView, verifyPassword } from "./auth";
import { AiService } from "./ai";
import { NotificationSender, PaymentProvider } from "./providers";
@Injectable()
export class AppService {
  constructor(
    @Inject(Repository) private db: Repository,
    @Inject(AiService) private ai: AiService,
    @Inject(PaymentProvider) private payment: PaymentProvider,
    @Inject(NotificationSender) private notifications: NotificationSender,
  ) {}
  async register(x: z.infer<typeof RegisterSchema>) {
    if (
      await this.db.user.findUnique({ where: { email: x.email.toLowerCase() } })
    )
      throw new ConflictException("Email уже используется");
    const user = await this.db.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: { name: x.companyName, criteria },
      });
      return tx.user.create({
        data: {
          companyId: c.id,
          email: x.email.toLowerCase(),
          name: x.name,
          role: "OWNER",
          passwordHash: hashPassword(x.password),
          limit: 10000000,
        },
      });
    });
    return this.session(user);
  }
  async login(x: z.infer<typeof LoginSchema>) {
    const u = await this.db.user.findUnique({
      where: { email: x.email.toLowerCase() },
    });
    if (!u || !verifyPassword(x.password, u.passwordHash))
      throw new UnauthorizedException("Неверный email или пароль");
    return this.session(u);
  }
  private async session(u: User) {
    const token = randomBytes(32).toString("hex");
    await this.db.session.create({
      data: {
        id: digest(token),
        userId: u.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return { token, user: userView(u) };
  }
  async logout(token: string) {
    await this.db.session.deleteMany({ where: { id: digest(token) } });
    return { ok: true };
  }
  async dashboard(u: User) {
    const companyId = tenant(u),
      manager = u.role !== "EMPLOYEE";
    const [
      company,
      materials,
      assignments,
      attempts,
      users,
      transactions,
      operations,
    ] = await Promise.all([
      this.db.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, balance: true },
      }),
      this.db.material.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      }),
      this.db.assignment.findMany({
        where: { companyId },
        include: { material: true },
        orderBy: { createdAt: "desc" },
      }),
      this.db.attempt.findMany({
        where: { companyId, ...(!manager ? { userId: u.id } : {}) },
        include: {
          user: { select: { name: true, email: true } },
          assignment: { select: { content: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      manager
        ? this.db.user.findMany({
            where: { companyId },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              companyId: true,
              limit: true,
              spent: true,
            },
          })
        : [],
      manager
        ? this.db.creditTransaction.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [],
      this.db.aiOperation.findMany({
        where: { companyId, ...(!manager ? { userId: u.id } : {}) },
        select: {
          id: true,
          status: true,
          cost: true,
          reserved: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      user: userView(u),
      company,
      materials,
      assignments,
      attempts,
      users,
      transactions,
      operations,
    };
  }
  async material(u: User, x: z.infer<typeof MaterialSchema>) {
    return this.db.material.create({ data: { companyId: tenant(u), ...x } });
  }
  async generate(u: User, id: string) {
    const companyId = tenant(u);
    const m = await this.db.material.findFirst({ where: { id, companyId } });
    if (!m) throw new NotFoundException();
    const c = await this.db.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    const op = await this.ai.run(u, "generate", {
      materialId: id,
      source: m.text,
      criteria: c.criteria,
      instruction:
        "Составь одну практическую ситуацию по материалу и краткий конспект. evidence дословно из источника.",
    });
    return this.db.assignment.upsert({
      where: { operationId: op.id },
      update: {},
      create: {
        companyId,
        materialId: id,
        operationId: op.id,
        content: op.result as Prisma.InputJsonValue,
        criteria: c.criteria as Prisma.InputJsonValue,
      },
    });
  }
  async attempt(u: User, id: string, x: z.infer<typeof AnswerSchema>) {
    const companyId = tenant(u);
    const a = await this.db.assignment.findFirst({
      where: { id, companyId },
      include: { material: true },
    });
    if (!a) throw new NotFoundException();
    const op = await this.ai.run(u, "evaluate", {
      assignmentId: id,
      source: a.material.text,
      criteria: a.criteria,
      question: a.content,
      answer: x.answer,
    });
    const attempt = await this.db.attempt.upsert({
      where: { operationId: op.id },
      update: {},
      create: {
        companyId,
        assignmentId: id,
        userId: u.id,
        answer: x.answer,
        operationId: op.id,
        evaluation: op.result as Prisma.InputJsonValue,
      },
    });
    return attempt;
  }
  async addUser(u: User, x: z.infer<typeof UserSchema>) {
    if (
      await this.db.user.findUnique({ where: { email: x.email.toLowerCase() } })
    )
      throw new ConflictException("Email уже используется");
    const employee = await this.db.user.create({
      data: {
        companyId: tenant(u),
        email: x.email.toLowerCase(),
        passwordHash: hashPassword(x.password),
        name: x.name,
        role: x.role,
        limit: x.limit,
      },
    });
    await this.notifications.send(
      tenant(u),
      employee.id,
      "Demo: учётная запись создана; передайте пароль сотруднику лично.",
    );
    return userView(employee);
  }
  async limit(u: User, id: string, x: z.infer<typeof LimitSchema>) {
    const companyId = tenant(u);
    const result = await this.db.user.updateMany({
      where: {
        id,
        companyId,
        role: { in: ["EMPLOYEE", "MANAGER"] },
        spent: { lte: x.limit },
      },
      data: { limit: x.limit },
    });
    if (!result.count)
      throw new ForbiddenException(
        "Пользователь недоступен или лимит ниже расхода/резерва",
      );
    return { ok: true };
  }
  async topup(u: User, x: z.infer<typeof TopUpSchema>) {
    const companyId = tenant(u),
      key = `topup:${companyId}:${x.key}`;
    const payment = await this.payment.createTopUp(x.amount, key);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${companyId} FOR UPDATE`;
      const old = await tx.creditTransaction.findUnique({ where: { key } });
      if (old) {
        if (old.amount !== x.amount)
          throw new ConflictException("Ключ уже использован с другой суммой");
        return old;
      }
      await tx.company.update({
        where: { id: companyId },
        data: { balance: { increment: payment.amount } },
      });
      return tx.creditTransaction.create({
        data: {
          companyId,
          userId: u.id,
          amount: payment.amount,
          key,
          kind: payment.status,
        },
      });
    });
  }
  async ledger() {
    const [companies, transactions, operations, calls] = await Promise.all([
      this.db.company.findMany(),
      this.db.creditTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.db.aiOperation.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.aiCall.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return { companies, transactions, operations, calls };
  }
}
