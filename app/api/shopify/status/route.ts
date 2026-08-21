import { SHOPIFY_STORE, normalizeShop, verifyShopifyConnection } from "../../../../lib/shopify";

const ALLOWED_ORIGIN = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site";

export async function GET(request: Request) {
  if (request.headers.get("origin") !== ALLOWED_ORIGIN) return Response.json({ status: "error", configured: false, message: "Request origin is not allowed." }, { status: 403 });
  const shop = normalizeShop(new URL(request.url).searchParams.get("shop") || "");
  if (!shop || shop !== SHOPIFY_STORE) return Response.json({ status: "error", configured: false, message: "Shopify store is not allowed." }, { status: 400 });
  return Response.json(await verifyShopifyConnection(shop));
}
