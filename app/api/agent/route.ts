/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureSchema, getStore, id } from "../../../db/store";

const roles: Record<string, string> = {
  monroe: "Business Manager focused on priorities, reporting, analysis, and operational planning",
  sage: "Social Media Manager focused on Metricool, content planning, and social analytics",
  cleo: "Customer Experience manager who reviews Gmail and prepares support drafts but never sends",
  lennox: "Commerce Manager focused on Shopify orders, fulfillment, products, inventory, and conversion",
  avery: "Product and Drop Manager focused on first-drop planning, specifications, samples, and production milestones",
};

const consequential = /(send|publish|post|schedule|contact|change|update|edit|fulfill|cancel|refund|discount|price|inventory|delete|theme|customer|supplier)/i;

function apiResponse(agentId: string, conversationId: string, message: string, extra: Record<string, unknown> = {}) {
  return { success: true, conversationId, agentId, message, status: "ready", proposedActions: [], approvalRequired: false, error: null, ...extra };
}

async function generate(system: string, prompt: string) {
  if (process.env.AI_GATEWAY_API_KEY) {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` }, body: JSON.stringify({ model: "openai/gpt-5.4", messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`AI Gateway request failed (${response.status})`);
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || "No response was returned.";
  }
  if (process.env.OPENAI_API_KEY) {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: "gpt-5.4", instructions: system, input: prompt }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const data = await response.json() as any;
    return data.output_text || data.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || "").join("\n") || "No response was returned.";
  }
  throw new Error("AI connection required");
}

export async function GET() {
  return Response.json({ success: true, service: "true-authentic-ai-operations", route: "/api/agent", model: "openai/gpt-5.4", configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as any;
  const agentId = String(body.agentId || "").toLowerCase();
  const message = String(body.message || "").trim();
  const conversationId = String(body.conversationId || crypto.randomUUID());
  if (!roles[agentId]) return Response.json({ success: false, conversationId, agentId, message: "Unknown employee.", status: "error", proposedActions: [], approvalRequired: false, error: "Invalid agentId" }, { status: 400 });
  if (!message) return Response.json({ success: false, conversationId, agentId, message: "Enter a request.", status: "error", proposedActions: [], approvalRequired: false, error: "Message is required" }, { status: 400 });

  try {
    const db = getStore();
    await ensureSchema(db);
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO conversations (id,agent_id,role,message,created_at) VALUES (?,?,?,?,?)").bind(id("msg"), agentId, "user", message, now).run();
    if (consequential.test(message)) {
      const approvalId = id("approval");
      const exact = `Requested instruction: ${message}`;
      await db.prepare("INSERT INTO approvals (id,agent_id,action_type,summary,reason,exact_change,target_platform,payload,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(approvalId, agentId, "proposed_external_action", `Review ${agentId}'s proposed action`, "Consequential external actions require Brandon's approval", exact, agentId === "cleo" ? "Gmail" : agentId === "sage" ? "Metricool" : agentId === "lennox" ? "Shopify" : "External service", JSON.stringify({ message }), "pending", now, now).run();
      return Response.json(apiResponse(agentId, conversationId, "I prepared the requested action for review. Nothing has been executed.", { status: "awaiting_approval", proposedActions: [{ id: approvalId, type: "proposed_external_action", summary: exact, payload: { message } }], approvalRequired: true }));
    }
    const system = `You are ${agentId}, ${roles[agentId]}, for True Authentic Apparel. Brand: luxury verified streetwear. Motto: The Truth Is Always Authentic. Be concise, factual, and never claim an integration is connected unless context proves it. External actions require human approval.`;
    const reply = await generate(system, message);
    await db.prepare("INSERT INTO conversations (id,agent_id,role,message,created_at) VALUES (?,?,?,?,?)").bind(id("msg"), agentId, "assistant", reply, new Date().toISOString()).run();
    return Response.json(apiResponse(agentId, conversationId, reply));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Backend unavailable";
    const connection = detail.includes("AI connection required");
    return Response.json({ success: false, conversationId, agentId, message: connection ? "AI connection required" : "The request could not be completed.", status: connection ? "connection_required" : "error", proposedActions: [], approvalRequired: false, error: detail }, { status: connection ? 503 : 500 });
  }
}
