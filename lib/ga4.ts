import { ensureSchema, getStore } from "../db/store";
import { decryptIntegrationSecret } from "./integration-secrets";

export const GA4_REDIRECT_URI = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations/ga4/callback";
export const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

export function ga4Config() {
  const clientId = process.env.GOOGLE_ANALYTICS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ANALYTICS_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret && encryptionKey) };
}

export async function refreshGa4AccessToken(refreshToken: string) {
  const { clientId, clientSecret } = ga4Config();
  if (!clientId || !clientSecret) throw new Error("GA4_NOT_CONFIGURED");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("GA4_REFRESH_FAILED");
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("GA4_REFRESH_FAILED");
  return body.access_token;
}

export async function verifyGa4Connection() {
  if (!ga4Config().configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "Google Analytics credentials are not configured." };
  try {
    const db = getStore(); await ensureSchema(db);
    const row = await db.prepare("SELECT encrypted_token,account_label FROM integration_connections WHERE provider='ga4' AND status='ready'").first<{ encrypted_token: string; account_label: string }>();
    if (!row) return { status: "connection_required" as const, checkedAt: null, configured: true, message: "Complete Google Analytics authorization." };
    const stored = JSON.parse(await decryptIntegrationSecret(row.encrypted_token)) as { refreshToken?: string; propertyId?: string };
    if (!stored.refreshToken || !stored.propertyId) throw new Error("INVALID_GA4_CONNECTION");
    const accessToken = await refreshGa4AccessToken(stored.refreshToken);
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(stored.propertyId)}:runReport`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "activeUsers" }], limit: 1 }) });
    if (!response.ok) throw new Error("GA4_VALIDATION_FAILED");
    return { status: "ready" as const, checkedAt: new Date().toISOString(), configured: true, message: `Connected to ${row.account_label}.` };
  } catch { return { status: "error" as const, checkedAt: null, configured: true, message: "Google Analytics authorization needs attention." }; }
}
