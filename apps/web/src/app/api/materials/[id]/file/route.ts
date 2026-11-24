import { cookies } from "next/headers";
import { COOKIE } from "@/lib/api";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return new Response("Нужен вход в аккаунт", { status: 401 });
  const { id } = await context.params;
  try {
    const upstream = await fetch(
      `${process.env.API_URL ?? "http://localhost:3011"}/materials/${encodeURIComponent(id)}/file`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!upstream.ok)
      return new Response("Файл недоступен", { status: upstream.status });
    return new Response(upstream.body, {
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition":
          upstream.headers.get("content-disposition") ?? "attachment",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Сервис временно недоступен", { status: 503 });
  }
}
