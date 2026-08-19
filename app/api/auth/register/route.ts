import { requestIpHash, requestOriginAllowed } from "../../../../lib/auth-request";
import { passwordPolicyValid, verificationCodeFormatValid } from "../../../../lib/account-policy.mjs";
import { normalizeEmail, isEmail, verificationCodeHash } from "../../../../lib/account-verification";
import { createSession, passwordHash } from "../../../../lib/standalone-auth";
import { postgres } from "../../../../lib/postgres";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return Response.json({ success: false, error: "Request origin is not allowed." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const confirmation = String(body.passwordConfirmation || "");
  const displayName = String(body.displayName || "").trim();
  const organizationName = String(body.organizationName || "").trim();
  const code = String(body.verificationCode || "").trim();
  if (!isEmail(email) || !passwordPolicyValid(password, confirmation) || !displayName || !organizationName || !verificationCodeFormatValid(code)) {
    return Response.json({ success: false, error: "Enter valid account details and a 9-digit verification code." }, { status: 400 });
  }
  try {
    const sql = postgres();
    const codeHash = verificationCodeHash(email, code);
    const ipHash = requestIpHash(request);
    const organizationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const passwordDigest = await passwordHash(password);
    const result = await sql`WITH candidate AS (
      SELECT id FROM email_verifications
      WHERE normalized_email=${email} AND purpose='owner_signup' AND code_hash=${codeHash}
        AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now() AND attempt_count<5
      ORDER BY created_at DESC LIMIT 1
    ), consumed AS (
      UPDATE email_verifications SET consumed_at=now()
      WHERE id=(SELECT id FROM candidate) AND consumed_at IS NULL AND invalidated_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM users)
      RETURNING id
    ), organization AS (
      INSERT INTO organizations(id,name,slug)
      SELECT ${organizationId},${organizationName},'true-authentic' FROM consumed RETURNING id
    ), app_user AS (
      INSERT INTO users(id,email,display_name,password_hash)
      SELECT ${userId},${email},${displayName},${passwordDigest} FROM consumed RETURNING id
    ), membership AS (
      INSERT INTO organization_memberships(organization_id,user_id,role)
      SELECT organization.id,app_user.id,'owner' FROM organization CROSS JOIN app_user
      RETURNING organization_id,user_id
    ), audit AS (
      INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,outcome,metadata)
      SELECT ${crypto.randomUUID()},membership.organization_id,membership.user_id,'owner.bootstrap','user',membership.user_id,'allowed',${JSON.stringify({ source: "verified-email-code", requestIpHash: ipHash })}::jsonb FROM membership
      RETURNING id
    ) SELECT consumed.id FROM consumed CROSS JOIN audit`;
    if (!result.length) {
      await sql`UPDATE email_verifications SET attempt_count=attempt_count+1 WHERE normalized_email=${email} AND purpose='owner_signup' AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now()`;
      return Response.json({ success: false, error: "The verification code is invalid or expired." }, { status: 400 });
    }
    await createSession(userId, organizationId);
    return Response.json({ success: true });
  } catch {
    return Response.json({ success: false, error: "Account creation is temporarily unavailable." }, { status: 503 });
  }
}
