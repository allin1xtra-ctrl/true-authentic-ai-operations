import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureSchema, getStore } from "../../../../../db/store";
import { encryptToken, normalizeShop, shopifyConfig, validateShopifyReadAccess } from "../shared";

async function validHmac(url: URL, secret: string) {
  const supplied = url.searchParams.get("hmac") || "";
  const message = [...url.searchParams.entries()].filter(([key]) => key !== "hmac").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  const expected = [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (expected.length !== supplied.length) return false;
  let mismatch = 0; for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return mismatch === 0;
}

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop") || "");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const config = shopifyConfig();
  if (!shop || !code || !state || !config.configured || !config.apiSecret || !config.apiKey || !config.appUrl || !await validHmac(url, config.apiSecret)) {
    return Response.redirect(`${url.origin}/?shopify=invalid#settings`, 303);
  }
  const db = getStore(); await ensureSchema(db);
  const stateHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const savedState = await db.prepare("SELECT id FROM oauth_states WHERE provider='shopify' AND state_hash=? AND account_label=? AND used_at IS NULL AND expires_at>=? LIMIT 1")
    .bind(stateHash, shop, new Date().toISOString()).first() as { id: string } | null;
  if (!savedState) return Response.redirect(`${config.appUrl}/?shopify=invalid#settings`, 303);
  await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(new Date().toISOString(), savedState.id).run();
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: config.apiKey, client_secret: config.apiSecret, code }) });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string; scope?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) return Response.redirect(`${config.appUrl}/?shopify=failed#settings`, 303);
  try { await validateShopifyReadAccess(shop, tokenBody.access_token); }
  catch { return Response.redirect(`${config.appUrl}/?shopify=validation_failed#settings`, 303); }
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES ('shopify','shopify',?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked")
    .bind(shop, await encryptToken(tokenBody.access_token), tokenBody.scope || "", "ready", now, now).run();
  return Response.redirect(`${config.appUrl}/?shopify=connected#settings`, 303);
}
