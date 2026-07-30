import { ensureSchema, getStore, id } from "../../../db/store";

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
  ["scheduling", "Scheduling", "ready", "Ready for read-only brief schedules", "daily command brief"],
];

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
}

export async function GET() {
  try {
    await seed();
    const db = getStore();
    const [tasks, memory, approvals, integrationRows, activity] = await Promise.all([
      db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 100").all(),
      db.prepare("SELECT * FROM memories ORDER BY created_at ASC").all(),
      db.prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100").all(),
      db.prepare("SELECT * FROM integrations ORDER BY name ASC").all(),
      db.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 50").all(),
    ]);
    return Response.json({ success: true, tasks: tasks.results, memories: memory.results, approvals: approvals.results, integrations: integrationRows.results, activity: activity.results });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "State unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = getStore();
    await ensureSchema(db);
    const now = new Date().toISOString();
    if (body.resource === "task") {
      const taskId = id("task");
      await db.prepare("INSERT INTO tasks (id,title,description,agent_id,priority,status,due_date,integration,approval_required,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(taskId, String(body.title || "Untitled task"), String(body.description || ""), String(body.agentId || "monroe"), String(body.priority || "medium"), "open", body.dueDate || null, body.integration || null, body.approvalRequired ? 1 : 0, now, now).run();
      return Response.json({ success: true, id: taskId }, { status: 201 });
    }
    if (body.resource === "approval" && typeof body.id === "string" && ["approved", "rejected"].includes(String(body.status))) {
      await db.prepare("UPDATE approvals SET status=?, updated_at=? WHERE id=?").bind(body.status, now, body.id).run();
      return Response.json({ success: true });
    }
    return Response.json({ success: false, error: "Unsupported state operation" }, { status: 400 });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}
