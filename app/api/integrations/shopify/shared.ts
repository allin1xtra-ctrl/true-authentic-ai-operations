import { getStore } from "../../../../db/store";

export const SHOPIFY_SCOPES = [
  "read_products", "read_inventory", "read_orders", "read_fulfillments",
].join(",");

export const SHOPIFY_API_VERSION = "2026-07";

export function shopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/$/, "");
  const encryptionSecret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  let origin: string | null = null;
  try {
    if (appUrl) {
      const parsed = new URL(appUrl);
      if (parsed.protocol === "https:" && parsed.pathname === "/" && !parsed.search && !parsed.hash) origin = parsed.origin;
    }
  } catch { /* reported as an incomplete configuration */ }
  return { apiKey, apiSecret, appUrl: origin, encryptionSecret, configured: Boolean(apiKey && apiSecret && origin && encryptionSecret) };
}

export function shopifyCallbackUrl() {
  const config = shopifyConfig();
  return config.appUrl ? `${config.appUrl}/api/integrations/shopify/callback` : null;
}

export function normalizeShop(value: string) {
  const input = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shop = input.includes(".") ? input : `${input}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = shopifyConfig().encryptionSecret;
  if (!secret) throw new Error("SHOPIFY_CONFIGURATION_REQUIRED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(token));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(value: string) {
  const [version, iv, cipher] = value.split(".");
  if (version !== "v1" || !iv || !cipher) throw new Error("INVALID_ENCRYPTED_TOKEN");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(cipher));
  return new TextDecoder().decode(decrypted);
}

export async function getShopifyConnection() {
  return getStore().prepare("SELECT * FROM integration_connections WHERE provider='shopify' LIMIT 1").first<Record<string, string>>();
}

export async function validateShopifyReadAccess(shop: string, token: string) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query: `query ValidateShopifyReadAccess {
      shop { id name myshopifyDomain }
      products(first: 1) { nodes { id title variants(first: 1) { nodes { inventoryItem { id tracked inventoryLevels(first: 1) { nodes { id } } } } } } }
      orders(first: 1, sortKey: CREATED_AT, reverse: true) { nodes { id name createdAt fulfillments(first: 1) { id status } } }
    }` }),
  });
  const body = await response.json().catch(() => null) as { data?: { shop?: { id?: string; myshopifyDomain?: string }; products?: unknown; orders?: unknown }; errors?: unknown } | null;
  const valid = response.ok && body?.data?.shop?.id && body.data.shop.myshopifyDomain === shop && body.data.products && body.data.orders && !body.errors;
  if (!valid) throw new Error("SHOPIFY_VALIDATION_FAILED");
  return true;
}
