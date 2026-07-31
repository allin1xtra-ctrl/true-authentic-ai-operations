import { getStore } from "../../../../db/store";

export const SHOPIFY_SCOPES = [
  "read_products", "read_inventory", "read_customers", "read_orders",
  "read_fulfillments", "read_merchant_managed_fulfillment_orders",
  "read_third_party_fulfillment_orders", "read_assigned_fulfillment_orders",
].join(",");

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
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
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
