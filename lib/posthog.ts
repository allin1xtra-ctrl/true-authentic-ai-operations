export function posthogConfig() {
  const host = (process.env.POSTHOG_HOST?.trim() || "https://us.posthog.com").replace(/\/$/, "");
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const token = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  return { host, projectId, token, configured: Boolean(projectId && token) };
}

export async function verifyPostHogConnection() {
  const { host, projectId, token, configured } = posthogConfig();
  if (!configured || !projectId || !token) return { status: "connection_required" as const, checkedAt: null, configured: false, message: "PostHog server credentials are not configured." };
  try {
    const response = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("POSTHOG_VALIDATION_FAILED");
    const body = await response.json() as { id?: number; name?: string };
    if (String(body.id) !== projectId) throw new Error("POSTHOG_VALIDATION_FAILED");
    return { status: "ready" as const, checkedAt: new Date().toISOString(), configured: true, message: `Connected to ${body.name || "PostHog project"}.` };
  } catch { return { status: "error" as const, checkedAt: null, configured: true, message: "PostHog validation failed." }; }
}
