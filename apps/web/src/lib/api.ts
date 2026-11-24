import "server-only";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3011";
export const COOKIE = "praktikum_session";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(COOKIE)?.value;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message ?? `Сервис ответил с кодом ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function json(body: unknown): string {
  return JSON.stringify(body);
}
