import { createVerificationCode, isEmail, normalizeEmail, sendVerificationCode, verificationCodeHash } from "../../../../lib/account-verification";
import { postgres } from "../../../../lib/postgres";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = normalizeEmail(body.email);
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
  if (!isEmail(email)) return Response.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
  try {
    const sql = postgres();
    const existing = await sql`SELECT id FROM users LIMIT 1`;
    if (existing.length) return Response.json({ success: false, error: "The owner account already exists. Sign in instead." }, { status: 409 });
    if (!ownerEmail || email !== ownerEmail) return Response.json({ success: true, message: "If this is the authorized owner email, a code will arrive shortly." });
    const recent = await sql`SELECT requested_at FROM account_setup_codes WHERE email=${email} AND requested_at > now() - interval '60 seconds' LIMIT 1`;
    if (recent.length) return Response.json({ success: false, error: "Please wait one minute before requesting another code." }, { status: 429 });
    const code = createVerificationCode();
    const hash = verificationCodeHash(email, code);
    await sql`INSERT INTO account_setup_codes(email,code_hash,expires_at,requested_at,failed_attempts,consumed_at) VALUES (${email},${hash},now()+interval '10 minutes',now(),0,NULL) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=excluded.requested_at,failed_attempts=0,consumed_at=NULL`;
    try {
      await sendVerificationCode(email, code);
    } catch {
      await sql`DELETE FROM account_setup_codes WHERE email=${email} AND code_hash=${hash}`;
      throw new Error("DELIVERY_FAILED");
    }
    return Response.json({ success: true, message: "A 9-digit code was sent to the authorized email address." });
  } catch {
    return Response.json({ success: false, error: "Email verification is not ready. Confirm the protected database and email settings." }, { status: 503 });
  }
}
