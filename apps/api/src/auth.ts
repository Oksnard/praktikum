import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { User } from "@prisma/client";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Request } from "express";
import { Repository } from "./repository";
export type AuthRequest = Request & { user: User };
export const Public = () => SetMetadata("public", true);
export const Allow = (...roles: string[]) => SetMetadata("roles", roles);
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function hashPassword(p: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
export function verifyPassword(p: string, hash: string) {
  const [salt, h] = hash.split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(h, "hex"),
    b = scryptSync(p, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function userView(u: User) {
  const { passwordHash: _passwordHash, ...v } = u;
  return v;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Repository) private db: Repository,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async canActivate(c: ExecutionContext) {
    if (this.reflector.get("public", c.getHandler())) return true;
    const r = c.switchToHttp().getRequest<AuthRequest>();
    const token = r.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { id: digest(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date())
      throw new UnauthorizedException("Сессия истекла");
    r.user = session.user;
    const roles = this.reflector.get<string[]>("roles", c.getHandler());
    if (roles && !roles.includes(r.user.role)) throw new ForbiddenException();
    return true;
  }
}
export function tenant(u: User) {
  if (!u.companyId) throw new ForbiddenException("Нужна компания");
  return u.companyId;
}
export function parse<T>(
  schema: {
    safeParse: (x: unknown) => { success: boolean; data?: T; error?: unknown };
  },
  x: unknown,
): T {
  const r = schema.safeParse(x);
  if (!r.success)
    throw new BadRequestException("Проверьте формат и длину полей");
  return r.data as T;
}
