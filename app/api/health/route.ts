import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore } from "../../../db/store";
import { decryptToken, getShopifyConnection, shopifyConfig, validateShopifyReadAccess } from "../integrations/shopify/shared";

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
  const checkedAt = new Date().toISOString();
  const configured = shopifyConfig().configured;
  if (!configured) return { status: "connection_required", checkedAt: null, configured, message: "Shopify connection settings are incomplete on this dashboard server." };
  try {
    const connection = await getShopifyConnection();
    if (!connection) return { status: "connection_required", checkedAt: null, configured };
    const token = await decryptToken(connection.encrypted_token);
    await validateShopifyReadAccess(connection.account_label, token);
    const status: Status = "ready";
    await getStore().prepare("UPDATE integration_connections SET status=?, last_checked=? WHERE provider='shopify'").bind(status, checkedAt).run();
    return { status, checkedAt, configured };
  } catch {
    await getStore().prepare("UPDATE integration_connections SET status='error', last_checked=? WHERE provider='shopify'").bind(checkedAt).run().catch(() => undefined);
    return { status: "error", checkedAt, configured, message: "Shopify authorization exists, but the live read-only validation failed." };
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
