import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureSchema, getStore } from "../../../../../db/store";
import { encryptToken, normalizeShop } from "../shared";

function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

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
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !code || !secret || url.searchParams.get("state") !== cookie(request, "shopify_oauth_state") || !await validHmac(url, secret)) {
    return Response.redirect(`${url.origin}/?shopify=invalid#settings`, 303);
  }
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: secret, code }) });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string; scope?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) return Response.redirect(`${url.origin}/?shopify=failed#settings`, 303);
  const db = getStore(); await ensureSchema(db); const now = new Date().toISOString();
  await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES ('shopify','shopify',?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked")
    .bind(shop, await encryptToken(tokenBody.access_token), tokenBody.scope || "", "ready", now, now).run();
  return new Response(null, { status: 303, headers: { location: `${url.origin}/?shopify=connected#settings`, "set-cookie": "shopify_oauth_state=; Path=/api/integrations/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } });
}
