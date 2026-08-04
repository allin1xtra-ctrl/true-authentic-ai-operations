import { createSession, passwordHash } from "../../../../lib/standalone-auth";
import { postgres } from "../../../../lib/postgres";

type RegistrationBody = {
  displayName?: string;
  email?: string;
  password?: string;
  invitationCode?: string;
};

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { success: false, error: "Account creation is unavailable until the database is connected." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as RegistrationBody;
  const displayName = String(body.displayName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const invitationCode = String(body.invitationCode || "");

  if (displayName.length < 2 || displayName.length > 120) {
    return Response.json(
      { success: false, error: "Enter your full name." },
      { status: 400 },
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json(
      { success: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  if (password.length < 14 || password.length > 256) {
    return Response.json(
      { success: false, error: "Use a password with at least 14 characters." },
      { status: 400 },
    );
  }

  const sql = postgres();
  const duplicate = await sql`SELECT id FROM users WHERE email=${email} LIMIT 1`;
  if (duplicate.length) {
    return Response.json(
      { success: false, error: "An account already exists for this email." },
      { status: 409 },
    );
  }

  const countRows = await sql`SELECT count(*)::int AS count FROM users`;
  const firstAccount = Number((countRows[0] as { count?: number | string } | undefined)?.count || 0) === 0;
  const organizationRows = await sql`SELECT id FROM organizations ORDER BY created_at LIMIT 1`;
  const existingOrganizationId = (organizationRows[0] as { id?: string } | undefined)?.id;

  if (!firstAccount) {
    const configuredCode = String(process.env.TEAM_REGISTRATION_CODE || "");
    if (configuredCode.length < 32) {
      return Response.json(
        { success: false, error: "Team registration has not been configured by the owner." },
        { status: 503 },
      );
    }
    if (invitationCode !== configuredCode) {
      return Response.json(
        { success: false, error: "A valid team invitation code is required." },
        { status: 403 },
      );
    }
    if (!existingOrganizationId) {
      return Response.json(
        { success: false, error: "The organization has not been initialized." },
        { status: 409 },
      );
    }
  }

  const organizationId = existingOrganizationId || crypto.randomUUID();
  const userId = crypto.randomUUID();
  const role = firstAccount ? "owner" : "team_member";
  const hash = await passwordHash(password);

  try {
    await sql.transaction((tx) => [
      ...(!existingOrganizationId
        ? [tx`INSERT INTO organizations(id,name,slug) VALUES (${organizationId},'True Authentic Apparel','true-authentic')`]
        : []),
      tx`INSERT INTO users(id,email,display_name,password_hash) VALUES (${userId},${email},${displayName},${hash})`,
      tx`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${organizationId},${userId},${role})`,
      tx`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,outcome,metadata) VALUES (${crypto.randomUUID()},${organizationId},${userId},'account.register','user',${userId},'allowed',${JSON.stringify({ role, source: firstAccount ? "first-owner-signup" : "team-invitation" })}::jsonb)`,
    ]);
  } catch {
    return Response.json(
      { success: false, error: "The account could not be created. Try again." },
      { status: 409 },
    );
  }

  await createSession(userId, organizationId);
  return Response.json({ success: true, firstAccount, role }, { status: 201 });
}
