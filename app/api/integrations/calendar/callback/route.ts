import { completeGoogleWorkspaceAuthorization, googleWorkspaceDoneUrl } from "../../../../../lib/google-workspace";

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  if (!code || !state || incoming.searchParams.has("error")) return Response.redirect(googleWorkspaceDoneUrl("calendar", "denied"), 302);
  try {
    await completeGoogleWorkspaceAuthorization("calendar", code, state);
    return Response.redirect(googleWorkspaceDoneUrl("calendar", "connected"), 302);
  } catch (error) {
    const result = error instanceof Error && error.message === "GOOGLE_WORKSPACE_PERMISSIONS_REQUIRED" ? "permissions" : error instanceof Error && error.message === "GOOGLE_WORKSPACE_STATE_INVALID" ? "invalid" : "failed";
    return Response.redirect(googleWorkspaceDoneUrl("calendar", result), 302);
  }
}
