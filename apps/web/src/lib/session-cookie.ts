type CookieEnvironment = {
  NODE_ENV?: string;
  PUBLIC_ORIGIN?: string;
  REVIEW_ALLOW_HTTP_COOKIE?: string;
};

/** HTTP review is a separate, explicitly configured instance, never a forwarded-header inference. */
export function sessionCookieOptions(
  env: CookieEnvironment,
  headers: Pick<Headers, "get">,
) {
  let secure = env.NODE_ENV === "production";
  if (env.REVIEW_ALLOW_HTTP_COOKIE === "true") {
    const origin = env.PUBLIC_ORIGIN ?? "";
    const match = /^http:\/\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)$/.exec(
      origin,
    );
    const url = match ? new URL(origin) : null;
    if (
      !match ||
      !url ||
      url.origin !== origin ||
      match[1].split(".").some((part) => Number(part) > 255) ||
      Number(match[2]) < 1024 ||
      Number(match[2]) > 65535 ||
      headers.get("host") !== url.host ||
      headers.get("origin") !== origin
    ) {
      throw new Error(
        "HTTP review cookie requires exact configured IP origin and request authority",
      );
    }
    secure = false;
  }
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
