import { ensureSchema, getStore } from "../db/store";
import { decryptIntegrationSecret } from "./integration-secrets";

export const CALENDAR_REDIRECT_URI = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations/calendar/callback";
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export function calendarConfig() {
  const clientId = process.env.CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.CALENDAR_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret && encryptionKey) };
}

async function calendarAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = calendarConfig();
  if (!clientId || !clientSecret) throw new Error("CALENDAR_NOT_CONFIGURED");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("CALENDAR_REFRESH_FAILED");
  const token = await response.json() as { access_token?: string };
  if (!token.access_token) throw new Error("CALENDAR_REFRESH_FAILED");
  return token.access_token;
}

export async function verifyCalendarConnection() {
  if (!calendarConfig().configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "Google Calendar OAuth credentials are not configured." };
  try {
    const db = getStore(); await ensureSchema(db);
    const row = await db.prepare("SELECT encrypted_token,account_label FROM integration_connections WHERE provider='calendar' AND status='ready'").first<{ encrypted_token: string; account_label: string }>();
    if (!row) return { status: "connection_required" as const, checkedAt: null, configured: true, message: "Complete Google Calendar authorization." };
    const { refreshToken } = JSON.parse(await decryptIntegrationSecret(row.encrypted_token)) as { refreshToken?: string };
    if (!refreshToken) throw new Error("INVALID_CALENDAR_CONNECTION");
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", { headers: { authorization: `Bearer ${await calendarAccessToken(refreshToken)}` }, cache: "no-store" });
    if (!response.ok) throw new Error("CALENDAR_VALIDATION_FAILED");
    const body = await response.json() as { items?: unknown[] };
    if (!Array.isArray(body.items)) throw new Error("CALENDAR_VALIDATION_FAILED");
    return { status: "ready" as const, checkedAt: new Date().toISOString(), configured: true, message: `Connected to ${row.account_label}.` };
  } catch { return { status: "error" as const, checkedAt: null, configured: true, message: "Google Calendar authorization needs attention." }; }
}
