import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../../../db/store";
import { normalizeShop, shopifyCallbackUrl, shopifyConfig, SHOPIFY_SCOPES } from "../shared";

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const config = shopifyConfig();
  const callback = shopifyCallbackUrl();
  if (!config.configured || !callback) {
    return Response.json({ success: false, error: "Shopify connection settings are incomplete on the dashboard server." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { shop?: string };
  const shop = normalizeShop(String(body.shop || ""));
  if (!shop) return Response.json({ success: false, error: "Enter a valid Shopify store, such as your-store.myshopify.com." }, { status: 400 });
  const state = crypto.randomUUID();
  const stateHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getStore();
  await ensureSchema(db);
  await db.prepare("DELETE FROM oauth_states WHERE expires_at < ? OR used_at IS NOT NULL").bind(new Date().toISOString()).run();
  await db.prepare("INSERT INTO oauth_states (id,provider,state_hash,account_label,expires_at,used_at) VALUES (?,?,?,?,?,NULL)")
    .bind(id("oauth"), "shopify", stateHash, shop, new Date(Date.now() + 10 * 60_000).toISOString()).run();
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", config.apiKey!);
  authorize.searchParams.set("scope", SHOPIFY_SCOPES);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  return Response.json({ success: true, url: authorize.toString() });
}
