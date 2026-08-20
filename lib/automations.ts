import { ensureSchema, getStore, id, type D1Like } from "../db/store";
import { generateAI } from "./ai";

export const agentIds = new Set(["monroe", "sage", "cleo", "lennox", "avery"]);
const prohibitedAction = /\b(send|publish|post to|schedule a post|contact|purchase|buy|place an order|update shopify|delete|refund|fulfill|cancel order|email customer)\b/i;

export function isSafeScheduledInstruction(instruction: string) {
  return instruction.length > 0 && instruction.length <= 4000 && !prohibitedAction.test(instruction);
}

function timezoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function nextRunAt(cadence: string, dailyTime: string | null, timezone: string, from = new Date()) {
  if (cadence === "hourly") return new Date(from.getTime() + 60 * 60 * 1000).toISOString();
  const [hour, minute] = (dailyTime || "06:30").split(":").map(Number);
  const local = timezoneParts(from, timezone);
  const localUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute));
  const offset = localUtc - from.getTime();
  let target = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), hour, minute) - offset;
  if (target <= from.getTime()) target += 24 * 60 * 60 * 1000;
  return new Date(target).toISOString();
}

async function runSchedule(db: D1Like, schedule: Record<string, unknown>) {
  const runId = id("run");
  const now = new Date().toISOString();
  const scheduleId = String(schedule.id);
  const agentId = String(schedule.agent_id);
  await db.prepare("INSERT INTO automation_runs (id,schedule_id,agent_id,status,attempt,started_at,created_at) VALUES (?,?,?,'running',1,?,?)").bind(runId, scheduleId, agentId, now, now).run();
  try {
    const memories = await db.prepare("SELECT category,content FROM memories WHERE approved=1 ORDER BY created_at ASC LIMIT 100").all<{ category: string; content: string }>();
    const memory = memories.results.map((item) => `${item.category}: ${item.content}`).join("\n");
    const system = `You are ${agentId}, an AI employee for True Authentic Apparel, completing a scheduled read-only assignment. Use only the approved business memory below. Never send, publish, contact, purchase, modify, or execute an external action. Never invent analytics or integration data. If required live data is unavailable, state exactly what connection is missing and give a useful plan or draft instead. The platform automatically stores your final response in the Operations Inbox, so provide the completed response directly and never claim that you cannot save it there.\n\nAPPROVED BUSINESS MEMORY\n${memory}`;
    const output = await generateAI(system, String(schedule.instruction));
    const completedAt = new Date().toISOString();
    await db.prepare("UPDATE automation_runs SET status='completed',output=?,completed_at=? WHERE id=?").bind(output.slice(0, 12000), completedAt, runId).run();
    await db.prepare("INSERT INTO inbox_items (id,agent_id,kind,title,summary,status,source_id,created_at) VALUES (?,?, 'automation_result',?,?,'unread',?,?)").bind(id("inbox"), agentId, String(schedule.name), output.slice(0, 12000), runId, completedAt).run();
    await db.prepare("UPDATE automation_schedules SET last_run_at=?,next_run_at=?,updated_at=? WHERE id=?").bind(completedAt, nextRunAt(String(schedule.cadence), schedule.daily_time ? String(schedule.daily_time) : null, String(schedule.timezone), new Date()), completedAt, scheduleId).run();
    await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,?, 'automation_completed',?,?)").bind(id("activity"), agentId, `Scheduled read-only job ${scheduleId} completed. No external action executed.`, completedAt).run();
    return { id: runId, status: "completed" };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error && error.message === "AI_CONNECTION_REQUIRED" ? "AI connection is required." : "The scheduled job could not be completed safely.";
    await db.prepare("UPDATE automation_runs SET status='failed',error=?,completed_at=? WHERE id=?").bind(message, completedAt, runId).run();
    await db.prepare("INSERT INTO inbox_items (id,agent_id,kind,title,summary,status,source_id,created_at) VALUES (?,?, 'automation_error',?,?,'unread',?,?)").bind(id("inbox"), agentId, `${String(schedule.name)} needs attention`, message, runId, completedAt).run();
    await db.prepare("UPDATE automation_schedules SET next_run_at=?,updated_at=? WHERE id=?").bind(new Date(Date.now() + 15 * 60 * 1000).toISOString(), completedAt, scheduleId).run();
    return { id: runId, status: "failed" };
  }
}

export async function runDueAutomations(options: { scheduleId?: string; limit?: number } = {}) {
  const db = getStore();
  await ensureSchema(db);
  const now = new Date().toISOString();
  const rows = options.scheduleId
    ? await db.prepare("SELECT * FROM automation_schedules WHERE id=? AND enabled=1 LIMIT 1").bind(options.scheduleId).all() as { results: Record<string, unknown>[] }
    : await db.prepare("SELECT * FROM automation_schedules WHERE enabled=1 AND next_run_at<=? ORDER BY next_run_at ASC LIMIT ?").bind(now, Math.min(options.limit || 5, 10)).all() as { results: Record<string, unknown>[] };
  const results = [];
  for (const schedule of rows.results) results.push(await runSchedule(db, schedule));
  return results;
}
