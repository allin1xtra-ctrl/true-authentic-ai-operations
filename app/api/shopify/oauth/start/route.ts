import { createShopifyAuthorization, normalizeShop, SHOPIFY_STORE, shopifyConfig } from "../../../../../lib/shopify";

export async function GET(request: Request) {
  const shop = normalizeShop(new URL(request.url).searchParams.get("shop") || "");
  if (shop !== SHOPIFY_STORE) return Response.json({ success: false, error: "This Shopify store is not allowed." }, { status: 403 });
  if (!shopifyConfig().configured) return Response.json({ success: false, error: "Shopify connection settings are incomplete." }, { status: 503 });
  return Response.redirect(await createShopifyAuthorization(shop), 302);
}
