import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore } from "../../../db/store";

const SHOPIFY_BACKEND = "https://true-authentic-ai-team-backend.vercel.app";
const SITES_ORIGIN = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site";
const SHOPIFY_STORE = "true-authentic-apparel.myshopify.com";

type Status = "ready" | "working" | "awaiting_approval" | "connection_required" | "error";

async function verifyAI(): Promise<{ status: Status; provider: string; checkedAt: string }> {
  const checkedAt = new Date().toISOString();
  const gatewayCredential = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const provider = gatewayCredential ? "vercel_ai_gateway" : process.env.OPENAI_API_KEY ? "openai_api" : "none";
  const credential = gatewayCredential || process.env.OPENAI_API_KEY;
  if (!credential) return { status: "connection_required", provider, checkedAt };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const endpoint = gatewayCredential ? "https://ai-gateway.vercel.sh/v1/models" : "https://api.openai.com/v1/models";
    const response = await fetch(endpoint, { headers: { authorization: `Bearer ${credential}` }, signal: controller.signal });
    return { status: response.ok ? "ready" : "error", provider, checkedAt };
  } catch {
    return { status: "error", provider, checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyShopify(): Promise<{ status: Status; checkedAt: string | null; configured: boolean; message?: string }> {
  const backend = process.env.SHOPIFY_BACKEND_URL?.trim().replace(/\/$/, "");
  if (backend !== SHOPIFY_BACKEND) return { status: "connection_required", checkedAt: null, configured: false, message: "Shopify connection proxy is unavailable." };
  try {
    const url = new URL("/api/shopify/status", backend); url.searchParams.set("shop", SHOPIFY_STORE);
    const response = await fetch(url, { headers: { origin: SITES_ORIGIN }, cache: "no-store" });
    const body = await response.json().catch(() => null) as { status?: Status; checkedAt?: string | null; configured?: boolean; message?: string } | null;
    if (!body?.status) throw new Error("INVALID_SHOPIFY_STATUS");
    return { status: body.status, checkedAt: body.checkedAt || null, configured: Boolean(body.configured), message: body.message };
  } catch {
    return { status: "error", checkedAt: null, configured: true, message: "Shopify backend validation is temporarily unavailable." };
  }
}

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });

  const ai = await verifyAI();
  let database: { status: Status; checkedAt: string } = { status: "error", checkedAt: new Date().toISOString() };
  let pendingByAgent: Record<string, number> = {};
  try {
    const db = getStore();
    await ensureSchema(db);
    await db.prepare("SELECT 1 AS ok").first();
    const pending = await db.prepare("SELECT agent_id, COUNT(*) AS count FROM approvals WHERE status='pending' GROUP BY agent_id").all<{ agent_id: string; count: number }>();
    pendingByAgent = Object.fromEntries(pending.results.map((row) => [row.agent_id, Number(row.count)]));
    database = { status: "ready", checkedAt: new Date().toISOString() };
  } catch {
    database = { status: "error", checkedAt: new Date().toISOString() };
  }

  const shopify = await verifyShopify();
  const integrations = {
    openai: ai,
    shopify,
    gmail: { status: "connection_required" as Status, checkedAt: null },
    metricool: { status: "connection_required" as Status, checkedAt: null },
    scheduling: { status: "connection_required" as Status, checkedAt: null },
  };
  const requiredIntegration: Record<string, keyof typeof integrations | null> = { monroe: null, avery: null, sage: "metricool", cleo: "gmail", lennox: "shopify" };
  const employees = Object.fromEntries(Object.entries(requiredIntegration).map(([agentId, integration]) => {
    let status: Status = ai.status;
    if (status === "ready" && integration && integrations[integration].status !== "ready") status = integrations[integration].status;
    if (status === "ready" && pendingByAgent[agentId]) status = "awaiting_approval";
    return [agentId, { status, requiredIntegration: integration, pendingApprovals: pendingByAgent[agentId] || 0 }];
  }));

  return Response.json({ success: true, checkedAt: new Date().toISOString(), ai, database, integrations, employees });
}
