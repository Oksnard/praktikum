import { cookies } from "next/headers";
import { uploadOriginAllowed } from "@/lib/upload-origin";
import { COOKIE } from "@/lib/api";
export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token)
    return Response.json({ message: "Нужен вход в аккаунт" }, { status: 401 });
  if (!uploadOriginAllowed(request, process.env.PUBLIC_ORIGIN))
    return Response.json(
      { message: "Недопустимый источник запроса" },
      { status: 403 },
    );
  const size = Number(request.headers.get("content-length"));
  if (!size || size > 5 * 1024 * 1024 + 8192)
    return Response.json(
      { message: "Максимальный размер файла — 5 МиБ" },
      { status: 413 },
    );
  try {
    const upstream = await fetch(
      `${process.env.API_URL ?? "http://localhost:3011"}/materials/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": request.headers.get("content-type") ?? "",
        },
        body: request.body,
        duplex: "half",
        cache: "no-store",
      } as RequestInit,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { message: "Сервис загрузки временно недоступен" },
      { status: 503 },
    );
  }
}
