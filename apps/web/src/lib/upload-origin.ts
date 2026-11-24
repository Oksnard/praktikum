/** A configured origin is server-owned. Forwarded headers are never an authority here. */
export function uploadOriginAllowed(
  request: Request,
  publicOrigin?: string,
): boolean {
  try {
    const localHost = request.headers.get("host");
    const local =
      localHost &&
      /^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$/.test(localHost)
        ? `${new URL(request.url).protocol}//${localHost}`
        : request.url;
    const expected = publicOrigin ? new URL(publicOrigin) : new URL(local);
    if (
      publicOrigin &&
      (expected.origin !== publicOrigin ||
        expected.username ||
        expected.password)
    )
      return false;
    return (
      ["https:", "http:"].includes(expected.protocol) &&
      request.headers.get("origin") === expected.origin
    );
  } catch {
    return false;
  }
}
