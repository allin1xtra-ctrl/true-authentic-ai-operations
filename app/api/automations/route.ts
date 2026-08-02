import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../db/store";
import { agentIds, isSafeScheduledInstruction, nextRunAt, runDueAutomations } from "../../../lib/automations";

async function authorized(request: Request) {
  const supplied = request.headers.get("x-automation-secret");
  if (env.AUTOMATION_CRON_SECRET && supplied && supplied === env.AUTOMATION_CRON_SECRET) return true;
  return Boolean(await getChatGPTUser());
}

export async function GET(request: Request) {
  if (!await authorized(request)) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const db = getStore(); await ensureSchema(db);
  const [schedules, runs, inbox] = await Promise.all([
    db.prepare("SELECT * FROM automation_schedules ORDER BY created_at DESC LIMIT 100").all(),
    db.prepare("SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT 100").all(),
    db.prepare("SELECT * FROM inbox_items ORDER BY created_at DESC LIMIT 100").all(),
  ]);
  return Response.json({ success: true, schedules: schedules.results, runs: runs.results, inbox: inbox.results, schedulerConfigured: Boolean(env.AUTOMATION_CRON_SECRET) });
}

export async function POST(request: Request) {
  if (!await authorized(request)) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = getStore(); await ensureSchema(db); const now = new Date().toISOString();
  if (body.action === "create") {
    const name = String(body.name || "").trim(); const instruction = String(body.instruction || "").trim(); const agentId = String(body.agentId || "");
    const cadence = ["hourly", "daily"].includes(String(body.cadence)) ? String(body.cadence) : "daily";
    const dailyTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.dailyTime || "")) ? String(body.dailyTime) : "06:30";
    const timezone = String(body.timezone || "America/Los_Angeles");
    if (!name || !agentIds.has(agentId)) return Response.json({ success: false, error: "Enter a name and choose an AI employee." }, { status: 400 });
    if (!isSafeScheduledInstruction(instruction)) return Response.json({ success: false, error: "Scheduled jobs must be read-only. Remove sending, publishing, purchasing, or store-changing instructions." }, { status: 400 });
    const scheduleId = id("schedule");
    await db.prepare("INSERT INTO automation_schedules (id,name,agent_id,instruction,cadence,daily_time,timezone,enabled,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)").bind(scheduleId, name.slice(0, 160), agentId, instruction, cadence, cadence === "daily" ? dailyTime : null, timezone, nextRunAt(cadence, dailyTime, timezone), now, now).run();
    return Response.json({ success: true, id: scheduleId }, { status: 201 });
  }
  if (body.action === "run" && typeof body.id === "string") return Response.json({ success: true, results: await runDueAutomations({ scheduleId: body.id }) });
  if (body.action === "toggle" && typeof body.id === "string") { await db.prepare("UPDATE automation_schedules SET enabled=?,updated_at=? WHERE id=?").bind(body.enabled ? 1 : 0, now, body.id).run(); return Response.json({ success: true }); }
  if (body.action === "read" && typeof body.id === "string") { await db.prepare("UPDATE inbox_items SET status='read',read_at=? WHERE id=?").bind(now, body.id).run(); return Response.json({ success: true }); }
  if (body.action === "tick") return Response.json({ success: true, results: await runDueAutomations() });
  return Response.json({ success: false, error: "Unsupported automation operation" }, { status: 400 });
}
