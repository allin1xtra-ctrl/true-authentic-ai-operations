import { getChatGPTUser } from "../../../../chatgpt-auth";
import { normalizeShop, SHOPIFY_SCOPES } from "../shared";

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET || !process.env.INTEGRATION_ENCRYPTION_KEY) {
    return Response.json({ success: false, error: "Shopify OAuth is not configured on the server yet." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { shop?: string };
  const shop = normalizeShop(String(body.shop || ""));
  if (!shop) return Response.json({ success: false, error: "Enter a valid Shopify store, such as your-store.myshopify.com." }, { status: 400 });
  const state = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  const callback = `${origin}/api/integrations/shopify/callback`;
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID);
  authorize.searchParams.set("scope", SHOPIFY_SCOPES);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", `shopify_oauth_state=${state}; Path=/api/integrations/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(JSON.stringify({ success: true, url: authorize.toString() }), { headers });
}
