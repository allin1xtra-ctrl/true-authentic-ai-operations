import { getChatGPTUser } from "../../../../chatgpt-auth";
import { createShopifyAuthorization, normalizeShop, shopifyConfig } from "../../../../../lib/shopify";

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const shop = normalizeShop(new URL(request.url).searchParams.get("shop") || "");
  if (!shop) return Response.json({ success: false, error: "Enter a valid Shopify store." }, { status: 400 });
  if (!shopifyConfig().configured) return Response.json({ success: false, error: "Shopify connection settings are incomplete." }, { status: 503 });
  return Response.redirect(await createShopifyAuthorization(shop), 302);
}
