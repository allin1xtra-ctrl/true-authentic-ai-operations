import { ensureSchema, getStore } from "../db/store";
import { decryptIntegrationSecret } from "./integration-secrets";

export const GMAIL_REDIRECT_URI = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations/gmail/callback";
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function gmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret && encryptionKey) };
}

async function gmailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = gmailConfig();
  if (!clientId || !clientSecret) throw new Error("GMAIL_NOT_CONFIGURED");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("GMAIL_REFRESH_FAILED");
  const token = await response.json() as { access_token?: string };
  if (!token.access_token) throw new Error("GMAIL_REFRESH_FAILED");
  return token.access_token;
}

export async function verifyGmailConnection() {
  if (!gmailConfig().configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "Gmail OAuth credentials are not configured." };
  try {
    const db = getStore(); await ensureSchema(db);
    const row = await db.prepare("SELECT encrypted_token,account_label FROM integration_connections WHERE provider='gmail' AND status='ready'").first<{ encrypted_token: string; account_label: string }>();
    if (!row) return { status: "connection_required" as const, checkedAt: null, configured: true, message: "Complete Gmail authorization." };
    const { refreshToken } = JSON.parse(await decryptIntegrationSecret(row.encrypted_token)) as { refreshToken?: string };
    if (!refreshToken) throw new Error("INVALID_GMAIL_CONNECTION");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${await gmailAccessToken(refreshToken)}` }, cache: "no-store" });
    if (!response.ok) throw new Error("GMAIL_VALIDATION_FAILED");
    const profile = await response.json() as { emailAddress?: string };
    if (!profile.emailAddress) throw new Error("GMAIL_VALIDATION_FAILED");
    return { status: "ready" as const, checkedAt: new Date().toISOString(), configured: true, message: `Connected to ${profile.emailAddress}.` };
  } catch { return { status: "error" as const, checkedAt: null, configured: true, message: "Gmail authorization needs attention." }; }
}
