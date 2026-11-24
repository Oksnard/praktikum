"use server";

import { api, COOKIE } from "@/lib/api";
import type { UserView } from "@praktikum/types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type AuthResult = { token: string; user: UserView };
const value = (form: FormData, name: string): string =>
  String(form.get(name) ?? "").trim();
const rawValue = (form: FormData, name: string): string =>
  String(form.get(name) ?? "");
const number = (form: FormData, name: string): number => Number(form.get(name));
function userMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENAI_API_KEY") || message.includes("AI недоступ"))
    return "AI сейчас недоступен: сервис не настроен. Баланс и лимит не списаны.";
  return message || "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export async function signIn(form: FormData): Promise<void> {
  let result: AuthResult;
  try {
    result = await api<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: value(form, "email"),
        password: rawValue(form, "password"),
      }),
    });
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent(userMessage(error))}`);
  }
  (await cookies()).set(COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect(result.user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
}
export async function register(form: FormData): Promise<void> {
  let result: AuthResult;
  try {
    result = await api<AuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: value(form, "name"),
        email: value(form, "email"),
        password: rawValue(form, "password"),
        companyName: value(form, "companyName"),
      }),
    });
  } catch (error) {
    redirect(`/register?error=${encodeURIComponent(userMessage(error))}`);
  }
  (await cookies()).set(COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/dashboard");
}
export async function signOut(): Promise<void> {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* The local session still needs to be removed when the API is offline. */
  }
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
async function mutate(
  path: string,
  method: string,
  body: unknown,
): Promise<void> {
  try {
    await api(path, { method, body: JSON.stringify(body) });
  } catch (error) {
    redirect(`/dashboard?error=${encodeURIComponent(userMessage(error))}`);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
export async function createMaterial(f: FormData): Promise<void> {
  await mutate("/materials", "POST", {
    title: value(f, "title"),
    text: value(f, "text"),
  });
}
export async function generate(id: string): Promise<void> {
  await mutate(`/materials/${id}/generate`, "POST", {});
}
export async function submitAnswer(id: string, f: FormData): Promise<void> {
  await mutate(`/assignments/${id}/attempts`, "POST", {
    answer: value(f, "answer"),
  });
}
export async function createUser(f: FormData): Promise<void> {
  await mutate("/users", "POST", {
    name: value(f, "name"),
    email: value(f, "email"),
    password: rawValue(f, "password"),
    role: value(f, "role"),
    limit: number(f, "limit"),
  });
}
export async function setLimit(id: string, f: FormData): Promise<void> {
  await mutate(`/users/${id}/limit`, "PATCH", { limit: number(f, "limit") });
}
export async function topUp(f: FormData): Promise<void> {
  await mutate("/credits/topup", "POST", {
    amount: number(f, "amount"),
    key: crypto.randomUUID(),
  });
}
