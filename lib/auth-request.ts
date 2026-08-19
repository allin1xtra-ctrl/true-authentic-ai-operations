import { createHmac } from "node:crypto";

export function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = String(process.env.APP_BASE_URL || "").trim();
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  return origin === expected;
}

export function requestIpHash(request: Request) {
  const secret = String(process.env.EMAIL_VERIFICATION_PEPPER || process.env.AUTH_CODE_SECRET || "");
  if (secret.length < 32) throw new Error("EMAIL_VERIFICATION_PEPPER_NOT_CONFIGURED");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHmac("sha256", secret).update(address).digest("hex");
}

export const genericVerificationMessage = "If this address is authorized, a verification code will arrive shortly.";
