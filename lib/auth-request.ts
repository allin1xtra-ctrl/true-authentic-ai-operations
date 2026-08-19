export function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = String(process.env.APP_BASE_URL || "").trim();
  let expected: string;
  try {
    expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  } catch {
    return false;
  }
  return origin === expected;
}
