import { getChatGPTUser } from "../../../../chatgpt-auth";
import { createGoogleWorkspaceAuthorization } from "../../../../../lib/google-workspace";

export async function POST() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    return Response.json({ success: true, url: await createGoogleWorkspaceAuthorization("calendar") });
  } catch {
    return Response.json({ success: false, error: "Google Calendar connection is not configured on the server." }, { status: 503 });
  }
}
