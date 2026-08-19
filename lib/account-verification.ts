import { createHmac, randomInt } from "node:crypto";

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

export function createVerificationCode() {
  return String(randomInt(100_000_000, 1_000_000_000));
}

export function verificationCodeHash(email: string, code: string) {
  const secret = String(process.env.AUTH_CODE_SECRET || "");
  if (secret.length < 32) throw new Error("AUTH_CODE_SECRET_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`${email}\0${code}`).digest("hex");
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function sendVerificationCode(email: string, code: string) {
  const apiKey = String(process.env.RESEND_API_KEY || "");
  const from = String(process.env.RESEND_FROM_EMAIL || "");
  if (!apiKey || !from) throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your True Authentic AI Operations setup code",
      html: `<div style="font-family:Arial,sans-serif;color:#171417"><h1 style="font-size:22px">Verify your owner account</h1><p>Enter this one-time code to finish creating your account:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes and can be used once. If you did not request it, ignore this email.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
}
