import { ensureSchema, getStore, id } from "../../../db/store";
import { getChatGPTUser } from "../../chatgpt-auth";

const memories = [
  ["brand", "Brand: True Authentic Apparel"],
  ["positioning", "Luxury streetwear built on proof, identity, and realness"],
  ["core", "Core idea: verified streetwear"],
  ["motto", "The Truth Is Always Authentic."],
  ["visual", "Brand color: deep oxblood, burgundy, and maroon"],
  ["website", "Website: https://www.ta-apparel.com"],
  ["tone", "Brand tone: premium, bold, confident, clean, modern"],
  ["policy", "Actions affecting customers, suppliers, Shopify, Gmail, or social platforms require approval"],
];

const integrations = [
  ["ai", "AI Engine", "connection_required", "AI connection required", "agent responses, daily brief"],
  ["shopify", "Shopify", "connection_required", "Connection required", "orders, products, fulfillment, sales"],
  ["gmail", "Gmail", "connection_required", "Connection required", "search inbox, read threads, prepare drafts"],
  ["metricool", "Metricool", "connection_required", "Connection required", "analytics, planner, drafts, scheduled posts"],
  ["scheduling", "Scheduling", "connection_required", "Connection required", "daily command brief"],
];

const agentIds = new Set(["monroe", "sage", "cleo", "lennox", "avery"]);

async function seed() {
  const db = getStore();
  await ensureSchema(db);
  const now = new Date().toISOString();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM memories").first<{ count: number }>();
  if (!count?.count) {
    await db.batch(memories.map(([category, content]) => db.prepare(
      "INSERT INTO memories (id, category, content, approved, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
    ).bind(id("mem"), category, content, now, now)));
  }
  const integrationCount = await db.prepare("SELECT COUNT(*) AS count FROM integrations").first<{ count: number }>();
  if (!integrationCount?.count) {
    await db.batch(integrations.map(([key, name, status, explanation, capabilities]) => db.prepare(
      "INSERT INTO integrations (id, name, status, explanation, capabilities, last_checked) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(key, name, status, explanation, capabilities, now)));
  }
  // No adapter may claim a live connection until it has a successful server-side check.
  await db.prepare("UPDATE integrations SET status='connection_required', explanation='Connection required', last_checked=NULL WHERE id IN ('ai','shopify','gmail','metricool','scheduling')").run();
}

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    await seed();
    const db = getStore();
    const [tasks, memory, approvals, integrationRows, activity, conversations] = await Promise.all([
      db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 100").all(),
      db.prepare("SELECT * FROM memories ORDER BY created_at ASC").all(),
      db.prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100").all(),
      db.prepare("SELECT * FROM integrations ORDER BY name ASC").all(),
      db.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 50").all(),
      db.prepare("SELECT * FROM conversations ORDER BY created_at ASC LIMIT 500").all(),
    ]);
    return Response.json({ success: true, tasks: tasks.results, memories: memory.results, approvals: approvals.results, integrations: integrationRows.results, activity: activity.results, conversations: conversations.results });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "State unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = getStore();
    await ensureSchema(db);
    const now = new Date().toISOString();
    if (body.resource === "task") {
      const agentId = String(body.agentId || "monroe");
      if (!agentIds.has(agentId)) return Response.json({ success: false, error: "Invalid employee" }, { status: 400 });
      const title = String(body.title || "").trim();
      if (!title) return Response.json({ success: false, error: "Task title is required" }, { status: 400 });
      const taskId = id("task");
      await db.prepare("INSERT INTO tasks (id,title,description,agent_id,priority,status,due_date,integration,approval_required,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(taskId, title.slice(0, 240), String(body.description || "").slice(0, 4000), agentId, ["low", "medium", "high"].includes(String(body.priority)) ? String(body.priority) : "medium", "open", body.dueDate || null, body.integration || null, body.approvalRequired ? 1 : 0, now, now).run();
      await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,?,?,?,?)").bind(id("activity"), agentId, "task_created", `Task ${taskId} created.`, now).run();
      return Response.json({ success: true, id: taskId }, { status: 201 });
    }
    if (body.resource === "task_update" && typeof body.id === "string" && ["open", "working", "awaiting_approval", "done", "error"].includes(String(body.status))) {
      const result = await db.prepare("UPDATE tasks SET status=?, updated_at=? WHERE id=?").bind(body.status, now, body.id).run() as { meta?: { changes?: number } };
      if (!result?.meta?.changes) return Response.json({ success: false, error: "Task not found" }, { status: 404 });
      await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) SELECT ?,agent_id,'task_status_updated',?,? FROM tasks WHERE id=?").bind(id("activity"), `Task ${body.id} changed to ${body.status}.`, now, body.id).run();
      return Response.json({ success: true });
    }
    if (body.resource === "approval" && typeof body.id === "string" && ["pending", "approved", "rejected"].includes(String(body.status))) {
      let result: { meta?: { changes?: number } };
      if (typeof body.exactChange === "string" && body.exactChange.trim()) {
        result = await db.prepare("UPDATE approvals SET status=?, exact_change=?, updated_at=? WHERE id=?").bind(body.status, body.exactChange.trim().slice(0, 8000), now, body.id).run() as { meta?: { changes?: number } };
      } else {
        result = await db.prepare("UPDATE approvals SET status=?, updated_at=? WHERE id=?").bind(body.status, now, body.id).run() as { meta?: { changes?: number } };
      }
      if (!result?.meta?.changes) return Response.json({ success: false, error: "Approval not found" }, { status: 404 });
      await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) SELECT ?,agent_id,'approval_decision',?,? FROM approvals WHERE id=?").bind(id("activity"), `Approval ${body.id} recorded as ${body.status}. No external action executed.`, now, body.id).run();
      return Response.json({ success: true });
    }
    return Response.json({ success: false, error: "Unsupported state operation" }, { status: 400 });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}
