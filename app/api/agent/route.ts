/* eslint-disable @typescript-eslint/no-explicit-any */
import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../db/store";

const MODEL = "gpt-5.4";
const REQUEST_TIMEOUT_MS = 45_000;

const roles: Record<string, string> = {
  monroe: "Business Manager focused on priorities, reporting, analysis, and operational planning",
  sage: "Social Media Manager focused on Metricool, content planning, and social analytics",
  cleo: "Customer Experience manager who reviews Gmail and prepares support drafts but never sends",
  lennox: "Commerce Manager focused on Shopify orders, fulfillment, products, inventory, and conversion",
  avery: "Product and Drop Manager focused on first-drop planning, specifications, samples, and production milestones",
};

const consequential = /(send|publish|post|schedule|contact|change|update|edit|fulfill|cancel|refund|discount|price|inventory|delete|theme|customer|supplier)/i;

function responseContract(agentId: string, conversationId: string, message: string, extra: Record<string, unknown> = {}) {
  return { success: true, conversationId, agentId, message, status: "ready", proposedActions: [], approvalRequired: false, error: null, ...extra };
}

function errorContract(agentId: string, conversationId: string, message: string, error: string, status: string) {
  return { success: false, conversationId, agentId, message, status, proposedActions: [], approvalRequired: false, error };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(data: any): string {
  const direct = typeof data?.output_text === "string" ? data.output_text.trim() : "";
  if (direct) return direct;
  const nested = Array.isArray(data?.output)
    ? data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((part: any) => typeof part?.text === "string" ? part.text.trim() : "")
      .filter(Boolean)
      .join("\n")
    : "";
  return nested.trim();
}

async function generate(system: string, prompt: string) {
  const gatewayCredential = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayCredential) {
    const result = await fetchWithTimeout("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${gatewayCredential}` },
      body: JSON.stringify({ model: `openai/${MODEL}`, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const data = await result.json() as any;
    const text = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }

  if (process.env.OPENAI_API_KEY) {
    const result = await fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: MODEL, instructions: system, input: prompt, store: false }),
    });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const text = extractResponseText(await result.json());
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }

  throw new Error("AI_CONNECTION_REQUIRED");
}

async function persistMessage(agentId: string, conversationId: string, role: string, message: string, status = "ready") {
  const db = getStore();
  await db.prepare("INSERT INTO conversations (id,conversation_id,agent_id,role,message,status,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id("msg"), conversationId, agentId, role, message, status, new Date().toISOString()).run();
}

async function logActivity(agentId: string, event: string, detail: string) {
  const db = getStore();
  await db.prepare("INSERT INTO activity (id,agent_id,event,detail,created_at) VALUES (?,?,?,?,?)")
    .bind(id("activity"), agentId, event, detail, new Date().toISOString()).run();
}

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  return Response.json({ success: true, service: "true-authentic-ai-operations", route: "/api/agent", model: MODEL, configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.OPENAI_API_KEY) });
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json(errorContract("", "", "Sign in to continue.", "Authentication required", "error"), { status: 401 });

  const body = await request.json().catch(() => ({})) as any;
  const agentId = String(body.agentId || "").toLowerCase();
  const message = String(body.message || "").trim();
  const conversationId = String(body.conversationId || crypto.randomUUID()).slice(0, 160);
  if (!roles[agentId]) return Response.json(errorContract(agentId, conversationId, "Unknown employee.", "Invalid employee", "error"), { status: 400 });
  if (!message) return Response.json(errorContract(agentId, conversationId, "Enter a request.", "Message is required", "error"), { status: 400 });
  if (message.length > 12_000) return Response.json(errorContract(agentId, conversationId, "The request is too long.", "Request too long", "error"), { status: 413 });

  try {
    const db = getStore();
    await ensureSchema(db);
    await persistMessage(agentId, conversationId, "user", message);
    await logActivity(agentId, "request_received", "Employee workspace received a request.");

    if (consequential.test(message)) {
      const approvalId = id("approval");
      const exactChange = `Requested instruction: ${message}`;
      const now = new Date().toISOString();
      const target = agentId === "cleo" ? "Gmail" : agentId === "sage" ? "Metricool" : agentId === "lennox" ? "Shopify" : "External service";
      await db.prepare("INSERT INTO approvals (id,agent_id,action_type,summary,reason,exact_change,target_platform,payload,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(approvalId, agentId, "proposed_external_action", `Review ${agentId}'s proposed action`, "Consequential external actions require Brandon's approval", exactChange, target, JSON.stringify({ message }), "pending", now, now).run();
      const reply = "I prepared the requested action for Brandon’s review. Nothing has been executed or sent.";
      await persistMessage(agentId, conversationId, "assistant", reply, "awaiting_approval");
      await logActivity(agentId, "approval_requested", `Approval ${approvalId} created for ${target}.`);
      return Response.json(responseContract(agentId, conversationId, reply, { status: "awaiting_approval", proposedActions: [{ id: approvalId, type: "proposed_external_action", summary: exactChange, payload: { message } }], approvalRequired: true }));
    }

    const system = `You are ${agentId}, ${roles[agentId]}, for True Authentic Apparel. Brand: luxury verified streetwear. Motto: The Truth Is Always Authentic. Be factual. Never claim an integration is connected unless verified server context proves it. Analyze and draft freely, but never send, publish, schedule, contact, or modify an external system. Every external action requires Brandon's explicit approval.`;
    const reply = await generate(system, message);
    await persistMessage(agentId, conversationId, "assistant", reply);
    await logActivity(agentId, "request_completed", "Employee returned a server-generated response.");
    return Response.json(responseContract(agentId, conversationId, reply));
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const connectionRequired = code === "AI_CONNECTION_REQUIRED";
    const timedOut = error instanceof Error && error.name === "AbortError";
    const messageText = connectionRequired ? "AI connection required." : timedOut ? "The AI request timed out. Please retry." : code === "AI_EMPTY_RESPONSE" ? "The AI service returned an empty response. Please retry." : "The AI request could not be completed.";
    try {
      await persistMessage(agentId, conversationId, "assistant", messageText, connectionRequired ? "connection_required" : "error");
      await logActivity(agentId, "request_failed", connectionRequired ? "AI connection required." : timedOut ? "AI request timed out." : "AI provider request failed.");
    } catch {
      // Preserve the sanitized response even when storage itself is unavailable.
    }
    return Response.json(errorContract(agentId, conversationId, messageText, connectionRequired ? "AI connection required" : "AI service unavailable", connectionRequired ? "connection_required" : "error"), { status: connectionRequired ? 503 : 502 });
  }
}
