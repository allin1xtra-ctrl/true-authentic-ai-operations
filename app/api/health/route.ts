import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore } from "../../../db/store";
import { verifyMetaConnection } from "../../../lib/meta";
import { verifyGa4Connection } from "../../../lib/ga4";
import { verifyPostHogConnection } from "../../../lib/posthog";
import { verifyRedis } from "../../../lib/redis";
import { verifyGoogleWorkspaceConnection } from "../../../lib/google-workspace";
import { verifyAIProvider } from "../../../lib/ai";

const SHOPIFY_BACKEND = "https://true-authentic-ai-team-backend.vercel.app";
const SITES_ORIGIN = "https://true-authentic-ai-operations.allin1xtra.chatgpt.site";
const SHOPIFY_STORE = "2f1f04-9f.myshopify.com";

type Status = "ready" | "working" | "awaiting_approval" | "connection_required" | "error";

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

  const ai = await verifyAIProvider();
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

  const [shopify, gmail, calendar, meta, ga4, posthog, redis] = await Promise.all([
    verifyShopify(),
    verifyGoogleWorkspaceConnection("gmail"),
    verifyGoogleWorkspaceConnection("calendar"),
    verifyMetaConnection(),
    verifyGa4Connection(),
    verifyPostHogConnection(),
    verifyRedis(),
  ]);
  const integrations = {
    openai: ai,
    shopify,
    gmail,
    meta,
    ga4,
    posthog,
    scheduling: calendar,
  };
  const requiredIntegration: Record<string, keyof typeof integrations | null> = { monroe: null, avery: null, sage: "meta", cleo: "gmail", lennox: "shopify" };
  const employees = Object.fromEntries(Object.entries(requiredIntegration).map(([agentId, integration]) => {
    let status: Status = ai.status;
    if (status === "ready" && integration && integrations[integration].status !== "ready") status = integrations[integration].status;
    if (status === "ready" && pendingByAgent[agentId]) status = "awaiting_approval";
    return [agentId, { status, requiredIntegration: integration, pendingApprovals: pendingByAgent[agentId] || 0 }];
  }));

  return Response.json({ success: true, checkedAt: new Date().toISOString(), ai, database, redis, integrations, employees });
}
