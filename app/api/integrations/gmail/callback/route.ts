import { ensureSchema, getStore, id } from "../../../../../db/store";
import { GMAIL_REDIRECT_URI, GMAIL_SCOPES, gmailConfig } from "../../../../../lib/gmail";
import { encryptIntegrationSecret } from "../../../../../lib/integration-secrets";

const dashboard = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/";
function done(result: string) { const url = new URL(dashboard); url.searchParams.set("gmail", result); url.hash = "settings"; return Response.redirect(url, 302); }
async function hash(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

export async function GET(request: Request) {
  const incoming = new URL(request.url); const code = incoming.searchParams.get("code"); const state = incoming.searchParams.get("state");
  if (!code || !state || incoming.searchParams.has("error")) return done("denied");
  const { clientId, clientSecret, configured } = gmailConfig(); if (!configured || !clientId || !clientSecret) return done("configuration");
  try {
    const db = getStore(); await ensureSchema(db); const stateHash = await hash(state); const now = new Date().toISOString();
    const saved = await db.prepare("SELECT id FROM oauth_states WHERE provider='gmail' AND state_hash=? AND used_at IS NULL AND expires_at>?").bind(stateHash, now).first() as { id: string } | null;
    if (!saved) return done("invalid");
    const claimed = await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(now, saved.id).run() as { meta?: { changes?: number } };
    if (!claimed.meta?.changes) return done("invalid");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: GMAIL_REDIRECT_URI, grant_type: "authorization_code" }) });
    if (!tokenResponse.ok) return done("exchange_failed");
    const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; scope?: string };
    if (!token.access_token || !token.refresh_token || !token.scope?.split(" ").includes(GMAIL_SCOPES[0])) return done("permissions");
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const profile = await profileResponse.json().catch(() => null) as { emailAddress?: string } | null;
    if (!profileResponse.ok || !profile?.emailAddress) return done("validation_failed");
    const encrypted = await encryptIntegrationSecret(JSON.stringify({ refreshToken: token.refresh_token }));
    await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES (?,'gmail',?,?,?,'ready',?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked").bind(id("connection"), profile.emailAddress, encrypted, GMAIL_SCOPES.join(","), now, now).run();
    await db.prepare("INSERT INTO integrations (id,name,status,explanation,capabilities,last_checked) VALUES ('gmail','Gmail','ready','Connected and verified','Read-only inbox validation',?) ON CONFLICT(id) DO UPDATE SET status='ready',explanation='Connected and verified',last_checked=excluded.last_checked").bind(now).run();
    await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,'cleo','integration_connected','Gmail connected with gmail.readonly. No messages were sent or modified.',?)").bind(id("activity"), now).run();
    return done("connected");
  } catch { return done("failed"); }
}
