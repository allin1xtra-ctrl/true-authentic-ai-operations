import { ensureSchema, getStore, id } from "../../../../../db/store";
import { GA4_REDIRECT_URI, GA4_SCOPES, ga4Config } from "../../../../../lib/ga4";
import { encryptIntegrationSecret } from "../../../../../lib/integration-secrets";

const dashboard = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/";
function done(result: string) { const url = new URL(dashboard); url.searchParams.set("ga4", result); url.hash = "settings"; return Response.redirect(url, 302); }
async function hash(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

export async function GET(request: Request) {
  const incoming = new URL(request.url); const code = incoming.searchParams.get("code"); const state = incoming.searchParams.get("state");
  if (!code || !state || incoming.searchParams.has("error")) return done("denied");
  const { clientId, clientSecret, configured } = ga4Config(); if (!configured || !clientId || !clientSecret) return done("configuration");
  try {
    const db = getStore(); await ensureSchema(db); const stateHash = await hash(state); const now = new Date().toISOString();
    const saved = await db.prepare("SELECT id FROM oauth_states WHERE provider='ga4' AND state_hash=? AND used_at IS NULL AND expires_at>?").bind(stateHash, now).first() as { id: string } | null;
    if (!saved) return done("invalid");
    const claimed = await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(now, saved.id).run() as { meta?: { changes?: number } };
    if (!claimed.meta?.changes) return done("invalid");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: GA4_REDIRECT_URI, grant_type: "authorization_code" }) });
    if (!tokenResponse.ok) return done("exchange_failed");
    const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; scope?: string };
    if (!token.access_token || !token.refresh_token || !token.scope?.split(" ").includes(GA4_SCOPES[0])) return done("permissions");
    const summariesResponse = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!summariesResponse.ok) return done("validation_failed");
    const summaries = await summariesResponse.json() as { accountSummaries?: Array<{ displayName?: string; propertySummaries?: Array<{ property?: string; displayName?: string }> }> };
    const account = summaries.accountSummaries?.find((item) => item.propertySummaries?.length);
    const property = account?.propertySummaries?.[0]; const propertyId = property?.property?.replace("properties/", "");
    if (!propertyId) return done("no_property");
    const reportResponse = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, { method: "POST", headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "activeUsers" }], limit: 1 }) });
    if (!reportResponse.ok) return done("validation_failed");
    const encrypted = await encryptIntegrationSecret(JSON.stringify({ refreshToken: token.refresh_token, propertyId }));
    const label = `${account?.displayName || "Google Analytics"} / ${property?.displayName || `Property ${propertyId}`}`;
    await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES (?,'ga4',?,?,?,'ready',?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked").bind(id("connection"), label, encrypted, GA4_SCOPES.join(","), now, now).run();
    await db.prepare("INSERT INTO integrations (id,name,status,explanation,capabilities,last_checked) VALUES ('ga4','Google Analytics 4','ready','Connected and verified','Read-only traffic, engagement, acquisition, and conversion reporting',?) ON CONFLICT(id) DO UPDATE SET status='ready',explanation='Connected and verified',last_checked=excluded.last_checked").bind(now).run();
    await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,'monroe','integration_connected','Google Analytics connected with analytics.readonly. No analytics configuration was changed.',?)").bind(id("activity"), now).run();
    return done("connected");
  } catch { return done("failed"); }
}
