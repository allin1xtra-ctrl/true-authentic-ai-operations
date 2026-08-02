import { ensureSchema, getStore } from "../db/store";

export const META_REDIRECT_URI = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations/meta/callback";
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "instagram_basic"];

function config() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  const version = process.env.META_GRAPH_VERSION?.trim() || "v24.0";
  return { appId, appSecret, encryptionKey, version, configured: Boolean(appId && appSecret && encryptionKey) };
}

function keyBytes(value: string) {
  if (/^[a-f\d]{64}$/i.test(value)) return Uint8Array.from(value.match(/../g)!.map((part) => Number.parseInt(part, 16)));
  try { const binary = atob(value); if (binary.length === 32) return Uint8Array.from(binary, (character) => character.charCodeAt(0)); } catch { /* invalid key */ }
  throw new Error("INVALID_ENCRYPTION_KEY");
}

async function cryptoKey(value: string) {
  return crypto.subtle.importKey("raw", keyBytes(value), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptMetaToken(value: string) {
  const { encryptionKey } = config(); if (!encryptionKey) throw new Error("META_NOT_CONFIGURED");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(encryptionKey), new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

export async function decryptMetaToken(value: string) {
  const { encryptionKey } = config(); if (!encryptionKey) throw new Error("META_NOT_CONFIGURED");
  const [ivPart, payloadPart] = value.split("."); if (!ivPart || !payloadPart) throw new Error("INVALID_TOKEN_PAYLOAD");
  const iv = Uint8Array.from(atob(ivPart), (character) => character.charCodeAt(0));
  const payload = Uint8Array.from(atob(payloadPart), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await cryptoKey(encryptionKey), payload));
}

export function metaConfig() { return config(); }

export async function verifyMetaConnection() {
  const configured = config().configured;
  if (!configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "Meta developer credentials are not configured." };
  try {
    const db = getStore(); await ensureSchema(db);
    const row = await db.prepare("SELECT encrypted_token,account_label FROM integration_connections WHERE provider='meta' AND status='ready'").first<{ encrypted_token: string; account_label: string }>();
    if (!row) return { status: "connection_required" as const, checkedAt: null, configured: true, message: "Complete Meta authorization." };
    const stored = JSON.parse(await decryptMetaToken(row.encrypted_token)) as { pageId?: string; pageToken?: string; instagramId?: string; scopes?: string[] };
    if (!stored.pageId || !stored.pageToken) throw new Error("INVALID_META_CONNECTION");
    const { version } = config();
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(stored.pageId)}`);
    url.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
    const response = await fetch(url, { cache: "no-store", headers: { authorization: `Bearer ${stored.pageToken}` } });
    if (!response.ok) throw new Error("META_VALIDATION_FAILED");
    const body = await response.json() as { id?: string };
    if (!body.id) throw new Error("META_VALIDATION_FAILED");
    return { status: "ready" as const, checkedAt: new Date().toISOString(), configured: true, message: `Connected to ${row.account_label}.` };
  } catch {
    return { status: "error" as const, checkedAt: null, configured: true, message: "Meta authorization needs attention." };
  }
}
