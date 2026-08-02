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

const requestModes = new Set(["analysis", "propose_action"]);
const readOnlyLead = /^(check|analy[sz]e|review|report|show|summarize|audit|inspect|read|find|list|compare)\b/i;
const externalMutation = /\b(send|publish|post|schedule|contact|order|purchase|buy|create|update|change|edit|delete|remove|refund|fulfill|cancel|message|email)\b/i;

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
  const mode = String(body.mode || "analysis");
  const conversationId = String(body.conversationId || crypto.randomUUID()).slice(0, 160);
  if (!roles[agentId]) return Response.json(errorContract(agentId, conversationId, "Unknown employee.", "Invalid employee", "error"), { status: 400 });
  if (!message) return Response.json(errorContract(agentId, conversationId, "Enter a request.", "Message is required", "error"), { status: 400 });
  if (!requestModes.has(mode)) return Response.json(errorContract(agentId, conversationId, "Choose analysis or prepare-for-approval mode.", "Invalid request mode", "error"), { status: 400 });
  if (message.length > 12_000) return Response.json(errorContract(agentId, conversationId, "The request is too long.", "Request too long", "error"), { status: 413 });

  try {
    const db = getStore();
    await ensureSchema(db);
    await persistMessage(agentId, conversationId, "user", message);
    await logActivity(agentId, "request_received", "Employee workspace received a request.");

    const readOnlyRequest = readOnlyLead.test(message) && !externalMutation.test(message);
    if (mode === "propose_action" && !readOnlyRequest) {
      const approvalId = id("approval");
      const exactChange = `Requested instruction: ${message}`;
      const now = new Date().toISOString();
      const target = agentId === "cleo" ? "Gmail" : agentId === "sage" ? "Meta" : agentId === "lennox" ? "Shopify" : "External service";
      await db.prepare("INSERT INTO approvals (id,agent_id,action_type,summary,reason,exact_change,target_platform,payload,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(approvalId, agentId, "proposed_external_action", `Review ${agentId}'s proposed action`, "Consequential external actions require Brandon's approval", exactChange, target, JSON.stringify({ message, conversationId }), "pending", now, now).run();
      const reply = "I prepared the requested action for Brandon’s review. Nothing has been executed or sent.";
      await persistMessage(agentId, conversationId, "assistant", reply, "awaiting_approval");
      await logActivity(agentId, "approval_requested", `Approval ${approvalId} created for ${target}.`);
      return Response.json(responseContract(agentId, conversationId, reply, { status: "awaiting_approval", proposedActions: [{ id: approvalId, type: "proposed_external_action", summary: exactChange, payload: { message } }], approvalRequired: true }));
    }

    const [memoryRows, historyRows] = await Promise.all([
      db.prepare("SELECT category, content FROM memories WHERE approved=1 ORDER BY updated_at DESC LIMIT 30").all(),
      db.prepare("SELECT role, message FROM conversations WHERE conversation_id=? AND agent_id=? ORDER BY created_at DESC LIMIT 12").bind(conversationId, agentId).all(),
    ]);
    const memory = memoryRows.results.map((row: any) => `${row.category}: ${row.content}`).join("\n");
    const history = historyRows.results.reverse().slice(0, -1).map((row: any) => `${row.role}: ${row.message}`).join("\n");
    const system = `You are ${agentId}, ${roles[agentId]}, for True Authentic Apparel. Be factual and concise. Use only the approved brand memory below as company truth. Never claim an integration is connected unless verified server context proves it. This request is analysis/drafting only: never send, publish, schedule, contact, or modify an external system. If live analytics or other source data was not provided in this request, say that it is unavailable rather than inventing results. If the user asks for execution, explain that they must switch to Prepare for approval mode.\n\nAPPROVED BRAND MEMORY\n${memory}`;
    const prompt = history ? `Recent workspace conversation:\n${history}\n\nCurrent request:\n${message}` : message;
    const reply = await generate(system, prompt);
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
