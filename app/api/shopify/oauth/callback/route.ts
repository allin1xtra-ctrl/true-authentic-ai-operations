import { ensureSchema, getStore } from "../../../../../db/store";
import { normalizeShop, saveShopifyConnection, sha256, SHOPIFY_APP, shopifyConfig, validShopifyHmac, validateShopifyReadAccess } from "../../../../../lib/shopify";

function done(result: string) { const url = new URL(SHOPIFY_APP); url.searchParams.set("shopify", result); url.hash = "settings"; return Response.redirect(url, 302); }

export async function GET(request: Request) {
  const incoming = new URL(request.url); const shop = normalizeShop(incoming.searchParams.get("shop") || "");
  const code = incoming.searchParams.get("code"); const state = incoming.searchParams.get("state"); const config = shopifyConfig();
  if (!shop || !code || !state || !config.configured || !config.apiKey || !config.apiSecret || !await validShopifyHmac(incoming, config.apiSecret)) return done("invalid");
  try {
    const db = getStore(); await ensureSchema(db); const now = new Date().toISOString(); const stateHash = await sha256(state);
    const saved = await db.prepare("SELECT id FROM oauth_states WHERE provider='shopify' AND state_hash=? AND account_label=? AND used_at IS NULL AND expires_at>?").bind(stateHash, shop, now).first<{ id: string }>();
    if (!saved) return done("invalid");
    const claimed = await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(now, saved.id).run();
    if (!claimed.meta.changes) return done("invalid");
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: config.apiKey, client_secret: config.apiSecret, code }) });
    const token = await tokenResponse.json().catch(() => null) as { access_token?: string; scope?: string } | null;
    if (!tokenResponse.ok || !token?.access_token) return done("exchange_failed");
    await validateShopifyReadAccess(shop, token.access_token); await saveShopifyConnection(shop, token.access_token, token.scope || config.scopes.join(","));
    return done("connected");
  } catch { return done("failed"); }
}
