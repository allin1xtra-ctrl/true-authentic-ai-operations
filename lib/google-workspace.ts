import { ensureSchema, getStore, id } from "../db/store";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "./integration-secrets";

export type GoogleWorkspaceProvider = "gmail" | "calendar";

const DASHBOARD_URL = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/";
const CALLBACK_BASE = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations";

const providers = {
  gmail: {
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    redirectUri: `${CALLBACK_BASE}/gmail/callback`,
    integrationId: "gmail",
    integrationName: "Gmail",
    capabilities: "Read-only inbox search, threads, and support review",
    agentId: "cleo",
  },
  calendar: {
    scopes: [
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ],
    redirectUri: `${CALLBACK_BASE}/calendar/callback`,
    integrationId: "scheduling",
    integrationName: "Google Calendar",
    capabilities: "Read-only calendar and event visibility for operational planning",
    agentId: "monroe",
  },
} as const;

export function googleWorkspaceProvider(provider: GoogleWorkspaceProvider) {
  return providers[provider];
}

export function googleWorkspaceConfig() {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_ANALYTICS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ANALYTICS_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret && encryptionKey) };
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function googleWorkspaceDoneUrl(provider: GoogleWorkspaceProvider, result: string) {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set(provider, result);
  url.hash = "settings";
  return url;
}

export async function createGoogleWorkspaceAuthorization(provider: GoogleWorkspaceProvider) {
  const { clientId, configured } = googleWorkspaceConfig();
  if (!configured || !clientId) throw new Error("GOOGLE_WORKSPACE_NOT_CONFIGURED");
  const details = googleWorkspaceProvider(provider);
  const state = crypto.randomUUID() + crypto.randomUUID();
  const db = getStore();
  await ensureSchema(db);
  const now = Date.now();
  await db.prepare("DELETE FROM oauth_states WHERE provider=? AND (expires_at < ? OR used_at IS NOT NULL)")
    .bind(provider, new Date(now).toISOString()).run();
  await db.prepare("INSERT INTO oauth_states (id,provider,state_hash,account_label,expires_at,used_at) VALUES (?,?,?,?,?,NULL)")
    .bind(id("oauth"), provider, await sha256(state), details.integrationName, new Date(now + 10 * 60_000).toISOString()).run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", details.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", details.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

async function exchangeCode(provider: GoogleWorkspaceProvider, code: string) {
  const { clientId, clientSecret, configured } = googleWorkspaceConfig();
  if (!configured || !clientId || !clientSecret) throw new Error("GOOGLE_WORKSPACE_NOT_CONFIGURED");
  const details = googleWorkspaceProvider(provider);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: details.redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error("GOOGLE_WORKSPACE_EXCHANGE_FAILED");
  const token = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
  const granted = new Set((token.scope || "").split(" ").filter(Boolean));
  if (!token.access_token || !token.refresh_token || details.scopes.some((scope) => !granted.has(scope))) throw new Error("GOOGLE_WORKSPACE_PERMISSIONS_REQUIRED");
  return token;
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret, configured } = googleWorkspaceConfig();
  if (!configured || !clientId || !clientSecret) throw new Error("GOOGLE_WORKSPACE_NOT_CONFIGURED");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("GOOGLE_WORKSPACE_REFRESH_FAILED");
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("GOOGLE_WORKSPACE_REFRESH_FAILED");
  return body.access_token;
}

async function validateProvider(provider: GoogleWorkspaceProvider, accessToken: string) {
  const endpoint = provider === "gmail"
    ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
    : "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary";
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error("GOOGLE_WORKSPACE_VALIDATION_FAILED");
  const body = await response.json() as { emailAddress?: string; summary?: string; id?: string };
  if (provider === "gmail" && !body.emailAddress) throw new Error("GOOGLE_WORKSPACE_VALIDATION_FAILED");
  if (provider === "calendar" && !body.id) throw new Error("GOOGLE_WORKSPACE_VALIDATION_FAILED");
  return provider === "gmail" ? body.emailAddress! : body.summary || "Primary calendar";
}

export async function completeGoogleWorkspaceAuthorization(provider: GoogleWorkspaceProvider, code: string, state: string) {
  const details = googleWorkspaceProvider(provider);
  const db = getStore();
  await ensureSchema(db);
  const now = new Date().toISOString();
  const saved = await db.prepare("SELECT id FROM oauth_states WHERE provider=? AND state_hash=? AND used_at IS NULL AND expires_at>?")
    .bind(provider, await sha256(state), now).first<{ id: string }>();
  if (!saved) throw new Error("GOOGLE_WORKSPACE_STATE_INVALID");
  const claimed = await db.prepare("UPDATE oauth_states SET used_at=? WHERE id=? AND used_at IS NULL").bind(now, saved.id).run();
  if (!claimed.meta.changes) throw new Error("GOOGLE_WORKSPACE_STATE_INVALID");
  const token = await exchangeCode(provider, code);
  const accountLabel = await validateProvider(provider, token.access_token!);
  const encrypted = await encryptIntegrationSecret(JSON.stringify({ refreshToken: token.refresh_token }));
  await db.prepare("INSERT INTO integration_connections (id,provider,account_label,encrypted_token,scopes,status,connected_at,last_checked) VALUES (?,?,?,?,?,'ready',?,?) ON CONFLICT(provider) DO UPDATE SET account_label=excluded.account_label,encrypted_token=excluded.encrypted_token,scopes=excluded.scopes,status='ready',connected_at=excluded.connected_at,last_checked=excluded.last_checked")
    .bind(id("connection"), provider, accountLabel, encrypted, details.scopes.join(","), now, now).run();
  await db.prepare("INSERT INTO integrations (id,name,status,explanation,capabilities,last_checked) VALUES (?,?,'ready','Connected and verified',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='ready',explanation='Connected and verified',capabilities=excluded.capabilities,last_checked=excluded.last_checked")
    .bind(details.integrationId, details.integrationName, details.capabilities, now).run();
  await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,?, 'integration_connected',?,?)")
    .bind(id("activity"), details.agentId, `${details.integrationName} connected with read-only access. No messages were sent and no calendar events were changed.`, now).run();
}

export async function verifyGoogleWorkspaceConnection(provider: GoogleWorkspaceProvider) {
  const details = googleWorkspaceProvider(provider);
  if (!googleWorkspaceConfig().configured) return { status: "connection_required" as const, checkedAt: null, configured: false, message: `${details.integrationName} OAuth credentials are not configured.` };
  const checkedAt = new Date().toISOString();
  try {
    const db = getStore();
    await ensureSchema(db);
    const row = await db.prepare("SELECT encrypted_token,account_label FROM integration_connections WHERE provider=? AND status='ready'")
      .bind(provider).first<{ encrypted_token: string; account_label: string }>();
    if (!row) return { status: "connection_required" as const, checkedAt: null, configured: true, message: `Complete ${details.integrationName} authorization.` };
    const stored = JSON.parse(await decryptIntegrationSecret(row.encrypted_token)) as { refreshToken?: string };
    if (!stored.refreshToken) throw new Error("INVALID_GOOGLE_WORKSPACE_CONNECTION");
    await validateProvider(provider, await refreshAccessToken(stored.refreshToken));
    await db.prepare("UPDATE integration_connections SET last_checked=? WHERE provider=?").bind(checkedAt, provider).run();
    return { status: "ready" as const, checkedAt, configured: true, message: `Connected to ${row.account_label}.` };
  } catch {
    return { status: "error" as const, checkedAt, configured: true, message: `${details.integrationName} authorization needs attention.` };
  }
}
