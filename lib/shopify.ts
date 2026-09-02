import { ensureSchema, getStore, id } from "../db/store";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "./integration-secrets";

export const SHOPIFY_API_VERSION = "2026-07";
export const SHOPIFY_STORE = "2f1f04-9f.myshopify.com";
export const SHOPIFY_CALLBACK = "https://true-authentic-ai-team-backend.vercel.app/api/shopify/oauth/callback";
export const SHOPIFY_APP = "https://true-authentic-ai-team-backend.vercel.app";
const ALLOWED_SCOPES = ["read_products", "read_inventory", "read_orders", "read_fulfillments"];

const SHOPIFY_SNAPSHOT_QUERY = `query ClaudeShopifySnapshot {
  shop {
    name
    myshopifyDomain
    currencyCode
  }
  products(first: 20, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      title
      status
      totalInventory
      updatedAt
      variants(first: 5) {
        nodes {
          id
          sku
          price
          inventoryQuantity
        }
      }
    }
  }
  orders(first: 10, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      name
      createdAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
}`;

export function normalizeShop(value: string) {
  const input = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shop = input.includes(".") ? input : `${input}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

export function shopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI?.trim();
  const scopes = (process.env.SHOPIFY_SCOPES || ALLOWED_SCOPES.join(",")).split(",").map((scope) => scope.trim()).filter(Boolean);
  const scopesValid = scopes.length > 0 && scopes.every((scope) => ALLOWED_SCOPES.includes(scope));
  const encryptionConfigured = Boolean(process.env.INTEGRATION_ENCRYPTION_KEY?.trim());
  return { apiKey, apiSecret, redirectUri, scopes, configured: Boolean(apiKey && apiSecret && redirectUri === SHOPIFY_CALLBACK && scopesValid && encryptionConfigured) };
}

export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createShopifyAuthorization(shop: string) {
  const config = shopifyConfig();
  if (!config.configured || !config.apiKey || !config.redirectUri) throw new Error("SHOPIFY_CONFIGURATION_REQUIRED");
  const state = crypto.randomUUID() + crypto.randomUUID(); const stateHash = await sha256(state);
  const db = getStore(); await ensureSchema(db); const now = Date.now();
  await db.prepare("DELETE FROM oauth_states WHERE provider='shopify' AND (expires_at < ? OR used_at IS NOT NULL)").bind(new Date(now).toISOString()).run();
  await db.prepare("INSERT INTO oauth_states (id,provider,state_hash,account_label,expires_at,used_at) VALUES (?,'shopify',?,?,?,NULL)")
    .bind(id("oauth"), stateHash, shop, new Date(now + 10 * 60_000).toISOString()).run();
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", config.apiKey); authorize.searchParams.set("scope", config.scopes.join(","));
  authorize.searchParams.set("redirect_uri", config.redirectUri); authorize.searchParams.set("state", state);
  return authorize.toString();
}

export async function validShopifyHmac(url: URL, secret: string) {
  const supplied = url.searchParams.get("hmac") || "";
  const message = [...url.searchParams.entries()].filter(([key]) => key !== "hmac").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  const expected = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (expected.length !== supplied.length) return false;
  let mismatch = 0; for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return mismatch === 0;
}

export async function validateShopifyReadAccess(shop: string, token: string) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query: "query ShopifyConnectionHealth { shop { id myshopifyDomain } products(first: 1) { nodes { id title } } }" }), cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { data?: { shop?: { id?: string; myshopifyDomain?: string }; products?: unknown }; errors?: unknown } | null;
  if (!response.ok || !body?.data?.shop?.id || body.data.shop.myshopifyDomain !== shop || !body.data.products || body.errors) throw new Error("SHOPIFY_VALIDATION_FAILED");
}

export async function saveShopifyConnection(shop: string, token: string, scopes: string) {
  const db = getStore(); await ensureSchema(db); const now = new Date().toISOString();
  await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES (?,'shopify',?,?,?,'ready',?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked")
    .bind(id("connection"), shop, await encryptIntegrationSecret(token), scopes, now, now).run();
}

export async function verifyShopifyConnection(shop = SHOPIFY_STORE) {
  const checkedAt = new Date().toISOString(); const config = shopifyConfig();
  if (!config.configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "Shopify connection settings are incomplete." };
  const db = getStore(); await ensureSchema(db);
  const connection = await db.prepare("SELECT account_label,encrypted_token FROM integration_connections WHERE provider='shopify' AND status='ready'").first<{ account_label: string; encrypted_token: string }>();
  if (!connection || connection.account_label !== shop) return { status: "connection_required" as const, checkedAt: null, configured: true, message: "Shopify authorization is required." };
  try {
    await validateShopifyReadAccess(shop, await decryptIntegrationSecret(connection.encrypted_token));
    await db.prepare("UPDATE integration_connections SET last_checked=? WHERE provider='shopify'").bind(checkedAt).run();
    return { status: "ready" as const, checkedAt, configured: true };
  } catch {
    await db.prepare("UPDATE integration_connections SET status='error',last_checked=? WHERE provider='shopify'").bind(checkedAt).run().catch(() => undefined);
    return { status: "error" as const, checkedAt, configured: true, message: "Shopify authorization exists, but read-only validation failed." };
  }
}

type ShopifySnapshotResponse = {
  data?: {
    shop?: { name?: string; myshopifyDomain?: string; currencyCode?: string };
    products?: { nodes?: Array<{ id?: string; title?: string; status?: string; totalInventory?: number | null; updatedAt?: string; variants?: { nodes?: Array<{ id?: string; sku?: string | null; price?: string; inventoryQuantity?: number | null }> } }> };
    orders?: { nodes?: Array<{ id?: string; name?: string; createdAt?: string; displayFinancialStatus?: string | null; displayFulfillmentStatus?: string | null; totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } } }> };
  };
  errors?: unknown;
};

export async function getShopifyReadContext(shop = SHOPIFY_STORE) {
  const db = getStore();
  await ensureSchema(db);
  const connection = await db.prepare("SELECT account_label,encrypted_token FROM integration_connections WHERE provider='shopify' AND status='ready'")
    .first<{ account_label: string; encrypted_token: string }>();
  if (!connection || connection.account_label !== shop) throw new Error("SHOPIFY_CONNECTION_REQUIRED");

  const token = await decryptIntegrationSecret(connection.encrypted_token);
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query: SHOPIFY_SNAPSHOT_QUERY }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as ShopifySnapshotResponse | null;
  if (!response.ok || body?.errors || body?.data?.shop?.myshopifyDomain !== shop) throw new Error("SHOPIFY_READ_FAILED");

  return {
    source: "shopify_admin_graphql",
    access: "read_only",
    checkedAt: new Date().toISOString(),
    shop: {
      name: body.data?.shop?.name || "True Authentic Apparel",
      domain: body.data?.shop?.myshopifyDomain || shop,
      currencyCode: body.data?.shop?.currencyCode || "USD",
    },
    products: (body.data?.products?.nodes || []).map((product) => ({
      id: product.id,
      title: product.title,
      status: product.status,
      totalInventory: product.totalInventory,
      updatedAt: product.updatedAt,
      variants: (product.variants?.nodes || []).map((variant) => ({ id: variant.id, sku: variant.sku, price: variant.price, inventoryQuantity: variant.inventoryQuantity })),
    })),
    recentOrders: (body.data?.orders?.nodes || []).map((order) => ({
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      total: order.totalPriceSet?.shopMoney || null,
    })),
    privacy: "No customer names, emails, addresses, notes, or payment details are included.",
  };
}
