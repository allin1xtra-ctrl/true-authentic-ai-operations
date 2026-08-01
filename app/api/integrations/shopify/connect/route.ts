import { getChatGPTUser } from "../../../../chatgpt-auth";

const EXPECTED_BACKEND = "https://true-authentic-ai-team-backend.vercel.app";

function normalizeShop(value: string) {
  const input = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shop = input.includes(".") ? input : `${input}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

function backendOrigin() {
  const configured = process.env.SHOPIFY_BACKEND_URL?.trim().replace(/\/$/, "");
  return configured === EXPECTED_BACKEND ? configured : null;
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const backend = backendOrigin();
  if (!backend) return Response.json({ success: false, error: "Shopify connection proxy is unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { shop?: string };
  const shop = normalizeShop(String(body.shop || ""));
  if (!shop) return Response.json({ success: false, error: "Enter a valid Shopify store, such as your-store.myshopify.com." }, { status: 400 });
  const start = new URL("/api/shopify/oauth/start", backend);
  start.searchParams.set("shop", shop);
  return Response.json({ success: true, url: start.toString() });
}
