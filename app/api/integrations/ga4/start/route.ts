import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../../../db/store";
import { GA4_REDIRECT_URI, GA4_SCOPES, ga4Config } from "../../../../../lib/ga4";

export async function POST() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const { clientId, configured } = ga4Config();
  if (!configured || !clientId) return Response.json({ success: false, error: "Google Analytics connection is not configured on the server." }, { status: 503 });
  const state = crypto.randomUUID() + crypto.randomUUID();
  const stateHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getStore(); await ensureSchema(db); const now = Date.now();
  await db.prepare("DELETE FROM oauth_states WHERE provider='ga4' AND expires_at < ?").bind(new Date(now).toISOString()).run();
  await db.prepare("INSERT INTO oauth_states (id,provider,state_hash,account_label,expires_at,used_at) VALUES (?,'ga4',?,'Google Analytics',?,NULL)").bind(id("oauth"), stateHash, new Date(now + 10 * 60_000).toISOString()).run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", GA4_REDIRECT_URI); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", GA4_SCOPES.join(" ")); url.searchParams.set("state", state); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); url.searchParams.set("include_granted_scopes", "true");
  return Response.json({ success: true, url: url.toString() });
}
