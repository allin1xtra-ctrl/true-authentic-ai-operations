import { ensureSchema, getStore, id } from "../../../../../db/store";
import { encryptMetaToken, META_REDIRECT_URI, META_SCOPES, metaConfig } from "../../../../../lib/meta";

const dashboard = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/";
function done(result: string) { const url = new URL(dashboard); url.searchParams.set("meta", result); url.hash = "settings"; return Response.redirect(url, 302); }
function hash(value: string) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")); }

export async function GET(request: Request) {
  const incoming = new URL(request.url); const code = incoming.searchParams.get("code"); const state = incoming.searchParams.get("state");
  if (!code || !state || incoming.searchParams.has("error")) return done("denied");
  const { appId, appSecret, configured, version } = metaConfig(); if (!configured || !appId || !appSecret) return done("configuration");
  try {
    const db = getStore(); await ensureSchema(db); const stateHash = await hash(state); const now = new Date().toISOString();
    const saved = await db.prepare("SELECT id FROM oauth_states WHERE provider='meta' AND state_hash=? AND used_at IS NULL AND expires_at>?").bind(stateHash, now).first() as { id: string } | null;
    if (!saved) return done("invalid");
    const claimed = await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(now, saved.id).run() as { meta?: { changes?: number } };
    if (!claimed.meta?.changes) return done("invalid");
    const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId); tokenUrl.searchParams.set("client_secret", appSecret); tokenUrl.searchParams.set("redirect_uri", META_REDIRECT_URI); tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl); if (!tokenResponse.ok) return done("exchange_failed");
    const token = await tokenResponse.json() as { access_token?: string }; if (!token.access_token) return done("exchange_failed");
    const longLivedUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token"); longLivedUrl.searchParams.set("client_id", appId); longLivedUrl.searchParams.set("client_secret", appSecret); longLivedUrl.searchParams.set("fb_exchange_token", token.access_token);
    const longLivedResponse = await fetch(longLivedUrl); if (!longLivedResponse.ok) return done("exchange_failed");
    const longLived = await longLivedResponse.json() as { access_token?: string }; if (!longLived.access_token) return done("exchange_failed");
    const permissionsUrl = new URL(`https://graph.facebook.com/${version}/me/permissions`);
    const permissionsResponse = await fetch(permissionsUrl, { headers: { authorization: `Bearer ${longLived.access_token}` } }); if (!permissionsResponse.ok) return done("permissions");
    const permissions = await permissionsResponse.json() as { data?: Array<{ permission?: string; status?: string }> };
    const granted = new Set(permissions.data?.filter((item) => item.status === "granted").map((item) => item.permission));
    if (META_SCOPES.some((scope) => !granted.has(scope))) return done("permissions");
    const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    const pagesResponse = await fetch(pagesUrl, { headers: { authorization: `Bearer ${longLived.access_token}` } }); if (!pagesResponse.ok) return done("validation_failed");
    const pages = await pagesResponse.json() as { data?: Array<{ id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } }> };
    const page = pages.data?.find((item) => item.id && item.name && item.access_token); if (!page?.id || !page.name || !page.access_token) return done("no_page");
    const encrypted = await encryptMetaToken(JSON.stringify({ pageId: page.id, pageToken: page.access_token, instagramId: page.instagram_business_account?.id || null, instagramUsername: page.instagram_business_account?.username || null, scopes: META_SCOPES }));
    const label = page.instagram_business_account?.username ? `${page.name} / @${page.instagram_business_account.username}` : page.name;
    await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES (?,'meta',?,?,?,'ready',?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked").bind(id("connection"), label, encrypted, META_SCOPES.join(","), now, now).run();
    await db.prepare("INSERT INTO integrations (id,name,status,explanation,capabilities,last_checked) VALUES ('meta','Meta','ready','Connected and verified','Facebook Page and Instagram account discovery',?) ON CONFLICT(id) DO UPDATE SET status='ready',explanation='Connected and verified',last_checked=excluded.last_checked").bind(now).run();
    await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,'sage','integration_connected','Meta connected with read-only account discovery. No content was published.',?)").bind(id("activity"), now).run();
    return done("connected");
  } catch { return done("failed"); }
}
