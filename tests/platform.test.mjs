import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("employee workspace calls the real backend", async () => {
  const source = await readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8");
  for (const employee of ["Monroe", "Sage", "Cleo", "Lennox", "Avery"]) assert.match(source, new RegExp(employee));
  assert.match(source, /fetch\("\/api\/agent"/);
  assert.match(source, /Open employee/);
  assert.match(source, /connection_required/);
});

test("agent API enforces approval and a consistent contract", async () => {
  const source = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");
  assert.match(source, /awaiting_approval/);
  assert.match(source, /approvalRequired/);
  assert.match(source, /proposedActions/);
  assert.match(source, /Nothing has been executed/);
  assert.match(source, /mode === "propose_action"/);
  assert.doesNotMatch(source, /const consequential/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*KEY/);
});

test("durable records use Neon Postgres and seed approved brand memory", async () => {
  const [store, state, schema] = await Promise.all([
    readFile(new URL("../db/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_quick_lyja.sql", import.meta.url), "utf8"),
  ]);
  assert.match(store, /DATABASE_URL/);
  assert.match(store, /postgres\(\)\.query/);
  assert.match(state, /The Truth Is Always Authentic/);
  assert.match(schema, /CREATE TABLE `approvals`/);
  assert.match(schema, /CREATE TABLE `tasks`/);
  assert.match(schema, /`conversation_id` text/);
});

test("protected routes require server-side identity", async () => {
  const [page, agent, state, health] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /currentStandaloneUser/);
  assert.match(page, /redirect\("\/login/);
  assert.doesNotMatch(page, /requireChatGPTUser|oai-authenticated/);
  for (const source of [agent, state, health]) assert.match(source, /getChatGPTUser/);
});

test("standalone authentication always redirects to the local login route", async () => {
  const auth = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const requireUser = auth.slice(
    auth.indexOf("export async function requireChatGPTUser"),
    auth.indexOf("export function chatGPTSignInPath"),
  );
  assert.match(requireUser, /redirect\(`\/login\?return_to=/);
  assert.doesNotMatch(requireUser, /chatGPTSignInPath/);
});

test("employee readiness is live, integration-specific, and approval-backed", async () => {
  const [health, ui] = await Promise.all([
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(health, /lennox: "shopify"/);
  assert.match(health, /cleo: "gmail"/);
  assert.match(health, /sage: "meta"/);
  assert.match(health, /status = "awaiting_approval"/);
  assert.match(ui, /pending\.some/);
  assert.doesNotMatch(ui, /const ready = ai\.configured/);
});

test("private credentials stay server-only and provider failures are sanitized", async () => {
  const [agent, health, example] = await Promise.all([
    readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${agent}\n${health}`, /NEXT_PUBLIC_.*(?:KEY|TOKEN|SECRET)/);
  assert.match(agent, /AI service unavailable/);
  assert.match(agent, /AI_EMPTY_RESPONSE/);
  assert.match(example, /OPENAI_API_KEY=/);
  assert.doesNotMatch(example, /sk-[A-Za-z0-9]/);
});

test("Shopify OAuth is delegated to a state-protected, encrypted, read-only backend", async () => {
  const [ui, connect, health, start, callback, status, shopify, example] = await Promise.all([
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/shopify/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopify/oauth/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopify/oauth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopify/status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/shopify.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /Connect Shopify/);
  assert.match(connect, /api\/shopify\/oauth\/start/);
  assert.match(health, /api\/shopify\/status/);
  assert.match(start, /getChatGPTUser/);
  assert.match(callback, /validShopifyHmac/);
  assert.match(callback, /state_hash/);
  assert.match(callback, /validateShopifyReadAccess/);
  assert.match(status, /ALLOWED_ORIGIN/);
  assert.match(shopify, /encryptIntegrationSecret/);
  assert.match(shopify, /decryptIntegrationSecret/);
  assert.match(shopify, /graphql\.json/);
  assert.match(shopify, /2f1f04-9f\.myshopify\.com/);
  assert.doesNotMatch(`${ui}\n${health}\n${shopify}`, /true-authentic-apparel(?:-store)?\.myshopify\.com/);
  assert.doesNotMatch(shopify, /write_/);
  assert.match(example, /SHOPIFY_BACKEND_URL=/);
  for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_REDIRECT_URI", "SHOPIFY_SCOPES", "INTEGRATION_ENCRYPTION_KEY"]) assert.match(example, new RegExp(`${key}=`));
  assert.doesNotMatch(`${ui}\n${connect}\n${health}\n${start}\n${callback}\n${status}\n${shopify}`, /NEXT_PUBLIC_.*(?:TOKEN|SECRET|SHOPIFY)/);
});

test("every disconnected settings card exposes an honest setup action", async () => {
  const ui = await readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8");
  for (const label of ["Set up Gmail", "Connect Meta", "Set up Calendar"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /Connection status will remain Required until OAuth and a live validation succeed/);
  assert.doesNotMatch(ui, /Available after Shopify/);
  assert.match(ui, /META · INSTAGRAM \+ FACEBOOK/);
});

test("Meta OAuth is state-protected, encrypted, read-only, and live-validated", async () => {
  const [start, callback, meta, encryption, health, ui] = await Promise.all([
    readFile(new URL("../app/api/integrations/meta/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/meta/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/integration-secrets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(start, /crypto\.randomUUID/);
  assert.match(start, /stateHash/);
  assert.match(callback, /used_at IS NULL/);
  assert.match(callback, /encryptMetaToken/);
  assert.match(encryption, /AES-GCM/);
  assert.match(meta, /pages_show_list/);
  assert.match(meta, /pages_read_engagement/);
  assert.match(meta, /instagram_basic/);
  assert.doesNotMatch(`${start}\n${callback}\n${meta}`, /pages_manage_posts|instagram_content_publish|instagram_manage_messages|instagram_manage_comments/);
  assert.match(health, /verifyMetaConnection/);
  assert.match(ui, /api\/integrations\/meta\/start/);
  assert.doesNotMatch(`${ui}\n${start}`, /NEXT_PUBLIC_.*META/);
});

test("GA4 and PostHog integrations are server-side, read-only, and live-validated", async () => {
  const [ui, health, ga4Start, ga4Callback, ga4, posthog, example] = await Promise.all([
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/ga4/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/ga4/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ga4.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/posthog.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /GOOGLE ANALYTICS 4/);
  assert.match(ui, /POSTHOG/);
  assert.match(ga4Start, /crypto\.randomUUID/);
  assert.match(ga4Callback, /used_at IS NULL/);
  assert.match(ga4Callback, /encryptIntegrationSecret/);
  assert.match(ga4, /analytics\.readonly/);
  assert.match(ga4, /GOOGLE_ANALYTICS_PROPERTY_ID/);
  assert.match(ga4Callback, /configuredPropertyId/);
  assert.doesNotMatch(`${ga4Start}\n${ga4Callback}\n${ga4}`, /analytics\.edit/);
  assert.match(posthog, /POSTHOG_PERSONAL_API_KEY/);
  assert.match(health, /verifyGa4Connection/);
  assert.match(health, /verifyPostHogConnection/);
  for (const key of ["GOOGLE_ANALYTICS_CLIENT_ID", "GOOGLE_ANALYTICS_CLIENT_SECRET", "POSTHOG_PERSONAL_API_KEY"]) assert.match(example, new RegExp(`${key}=`));
  assert.doesNotMatch(`${ui}\n${health}`, /NEXT_PUBLIC_.*(?:GOOGLE|POSTHOG|META)/);
});

test("generated media stays server-side and approval controls remain isolated", async () => {
  const [generation, media, ui] = await Promise.all([
    readFile(new URL("../app/api/media/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(generation, /getChatGPTUser/);
  assert.match(generation, /gpt-image-2/);
  assert.match(generation, /sora-2/);
  assert.match(generation, /private\/generated/);
  assert.match(media, /cache-control": "private, no-store/);
  assert.match(media, /@vercel\/blob/);
  assert.match(media, /access: "private"/);
  assert.match(ui, /Create with AI/);
  assert.match(ui, /readApiResponse/);
  assert.match(ui, /response\.status === 413/);
  assert.match(generation, /maxRequestBytes/);
  assert.match(generation, /maxPromptLength/);
  assert.doesNotMatch(`${generation}\n${ui}`, /NEXT_PUBLIC_.*OPENAI/);
  assert.doesNotMatch(generation, /api\/shopify/);
});

test("read-only requests do not create fake external approvals", async () => {
  const agent = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");
  assert.match(agent, /readOnlyRequest/);
  assert.match(agent, /mode === "propose_action" && !readOnlyRequest/);
  assert.match(agent, /live analytics or other source data was not provided/);
});

test("approval decisions disclose non-execution and clear stale conversation state", async () => {
  const [state, ui] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(state, /No external action executed/);
  assert.match(state, /UPDATE conversations SET status='ready'/);
  assert.match(ui, /Approved · not executed/);
  assert.match(ui, /does not execute/);
  assert.doesNotMatch(ui, /Approve record/);
});

test("tasks reject rapid duplicate submissions and expose lifecycle controls", async () => {
  const [state, ui] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(state, /duplicate: true/);
  assert.match(ui, /Saving…/);
  for (const label of ["Start", "Mark done", "Reopen"]) assert.match(ui, new RegExp(label));
});

test("phase one automations are durable, scheduled, and read-only", async () => {
  const [automation, cron, store, ui, vercel] = await Promise.all([
    readFile(new URL("../lib/automations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/automations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);
  for (const table of ["automation_schedules", "automation_runs", "inbox_items"]) assert.match(store, new RegExp(table));
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /runDueAutomations/);
  assert.match(automation, /Never send, publish, contact, purchase, modify, or execute/);
  assert.match(automation, /No external action executed/);
  assert.match(automation, /platform automatically stores your final response in the Operations Inbox/);
  assert.match(ui, /Operations inbox/);
  assert.match(ui, /Run now/);
  assert.match(vercel, /api\/cron\/automations/);
});

test("health verifies Redis with a temporary set, get, and delete probe", async () => {
  const [health, redis, example] = await Promise.all([
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/redis.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(health, /verifyRedis/);
  assert.match(health, /database, redis, integrations/);
  for (const command of ["SET", "GET", "DEL"]) assert.match(redis, new RegExp(`\\[\\\"${command}\\\"`));
  assert.match(redis, /EX.*60/);
  assert.match(redis, /finally/);
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) assert.match(example, new RegExp(`${key}=`));
  assert.doesNotMatch(`${health}\n${redis}`, /NEXT_PUBLIC_.*UPSTASH/);
});

test("automation API requires identity or the protected scheduler secret", async () => {
  const route = await readFile(new URL("../app/api/automations/route.ts", import.meta.url), "utf8");
  assert.match(route, /getChatGPTUser/);
  assert.match(route, /x-automation-secret/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /isSafeScheduledInstruction/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*SECRET/);
});
