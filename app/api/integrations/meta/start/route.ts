import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../../../db/store";
import { META_REDIRECT_URI, META_SCOPES, metaConfig } from "../../../../../lib/meta";

export async function POST() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const { appId, configured, version } = metaConfig();
  if (!configured || !appId) return Response.json({ success: false, error: "Meta connection is not configured on the server." }, { status: 503 });
  const state = crypto.randomUUID() + crypto.randomUUID();
  const stateHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getStore(); await ensureSchema(db); const now = Date.now();
  await db.prepare("DELETE FROM oauth_states WHERE provider='meta' AND expires_at < ?").bind(new Date(now).toISOString()).run();
  await db.prepare("INSERT INTO oauth_states (id,provider,state_hash,account_label,expires_at,used_at) VALUES (?,'meta',?,'Meta',?,NULL)").bind(id("oauth"), stateHash, new Date(now + 10 * 60_000).toISOString()).run();
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId); url.searchParams.set("redirect_uri", META_REDIRECT_URI); url.searchParams.set("state", state); url.searchParams.set("scope", META_SCOPES.join(",")); url.searchParams.set("response_type", "code");
  return Response.json({ success: true, url: url.toString() });
}
