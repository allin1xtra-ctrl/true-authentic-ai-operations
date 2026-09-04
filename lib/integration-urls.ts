export type OAuthProvider = "meta" | "ga4" | "gmail" | "calendar";

const PRODUCTION_ORIGIN = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site";

function secureOrigin(value?: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function integrationOrigin() {
  const explicit = secureOrigin(process.env.INTEGRATION_CALLBACK_ORIGIN);
  if (explicit) return explicit;
  if (process.env.VERCEL_ENV === "preview") {
    const preview = secureOrigin(process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);
    if (preview) return preview;
  }
  return PRODUCTION_ORIGIN;
}

export function integrationCallbackUrl(provider: OAuthProvider) {
  return new URL(`/api/integrations/${provider}/callback`, integrationOrigin()).toString();
}

export function integrationDashboardUrl() {
  return secureOrigin(process.env.INTEGRATION_DASHBOARD_URL) || integrationOrigin();
}
