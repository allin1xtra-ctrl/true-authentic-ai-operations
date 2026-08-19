import { genericVerificationMessage, requestIpHash, requestOriginAllowed } from "../../../../../lib/auth-request";
import { createVerificationCode, isEmail, normalizeEmail, sendVerificationCode, verificationCodeHash } from "../../../../../lib/account-verification";
import { postgres } from "../../../../../lib/postgres";

export const runtime = "nodejs";
const hourlyEmailLimit = 5;
const hourlyIpLimit = 20;

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return Response.json({ success: false, error: "Request origin is not allowed." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return Response.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
  try {
    const sql = postgres();
    const ipHash = requestIpHash(request);
    const limits = await sql`SELECT
      (SELECT count(*)::int FROM email_verifications WHERE normalized_email=${email} AND created_at>now()-interval '1 hour') AS email_count,
      (SELECT count(*)::int FROM email_verifications WHERE request_ip_hash=${ipHash} AND created_at>now()-interval '1 hour') AS ip_count,
      (SELECT max(last_sent_at) FROM email_verifications WHERE normalized_email=${email}) AS last_sent_at`;
    const limit = limits[0] as { email_count?: number; ip_count?: number; last_sent_at?: string } | undefined;
    if (Number(limit?.email_count || 0) >= hourlyEmailLimit || Number(limit?.ip_count || 0) >= hourlyIpLimit) {
      return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": "3600" } });
    }
    if (limit?.last_sent_at && Date.now() - new Date(limit.last_sent_at).getTime() < 60_000) {
      const retry = Math.max(1, Math.ceil((60_000 - (Date.now() - new Date(limit.last_sent_at).getTime())) / 1000));
      return Response.json({ success: false, error: "Please wait before requesting another code." }, { status: 429, headers: { "Retry-After": String(retry) } });
    }
    const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
    const existing = await sql`SELECT EXISTS(SELECT 1 FROM users) AS exists`;
    if (existing[0]?.exists || !ownerEmail || email !== ownerEmail) return Response.json({ success: true, message: genericVerificationMessage });
    const code = createVerificationCode();
    const hash = verificationCodeHash(email, code);
    const id = crypto.randomUUID();
    await sql.transaction((tx) => [
      tx`UPDATE email_verifications SET invalidated_at=now() WHERE normalized_email=${email} AND purpose='owner_signup' AND consumed_at IS NULL AND invalidated_at IS NULL`,
      tx`INSERT INTO email_verifications(id,normalized_email,code_hash,purpose,expires_at,last_sent_at,request_ip_hash) VALUES (${id},${email},${hash},'owner_signup',now()+interval '10 minutes',now(),${ipHash})`,
    ]);
    try {
      await sendVerificationCode(email, code);
    } catch {
      await sql`UPDATE email_verifications SET invalidated_at=now() WHERE id=${id}`;
      throw new Error("DELIVERY_FAILED");
    }
    return Response.json({ success: true, message: genericVerificationMessage });
  } catch {
    return Response.json({ success: false, error: "Email verification is temporarily unavailable." }, { status: 503 });
  }
}
