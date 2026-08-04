import { runDueAutomations } from "../../../../lib/automations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDueAutomations({ limit: 10 });
  return Response.json({ success: true, processed: result.length });
}
