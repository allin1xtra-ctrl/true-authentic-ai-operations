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

test("durable records use D1 and seed approved brand memory", async () => {
  const [hosting, state, schema] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_quick_lyja.sql", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
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
  assert.match(page, /requireChatGPTUser/);
  for (const source of [agent, state, health]) assert.match(source, /getChatGPTUser/);
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

test("Shopify OAuth is delegated to the protected Vercel backend", async () => {
  const [ui, connect, health, example] = await Promise.all([
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/shopify/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /Connect Shopify/);
  assert.match(connect, /api\/shopify\/oauth\/start/);
  assert.match(health, /api\/shopify\/status/);
  assert.match(example, /SHOPIFY_BACKEND_URL=/);
  for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "INTEGRATION_ENCRYPTION_KEY"]) assert.doesNotMatch(example, new RegExp(`${key}=`));
  assert.doesNotMatch(`${connect}\n${health}`, /SHOPIFY_API_(?:KEY|SECRET)/);
  assert.doesNotMatch(`${ui}\n${connect}`, /NEXT_PUBLIC_.*(?:TOKEN|SECRET)/);
});

test("every disconnected settings card exposes an honest setup action", async () => {
  const ui = await readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8");
  for (const label of ["Set up Gmail", "Connect Meta", "Set up Calendar"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /Connection status will remain Required until OAuth and a live validation succeed/);
  assert.doesNotMatch(ui, /Available after Shopify/);
  assert.match(ui, /META · INSTAGRAM \+ FACEBOOK/);
});

test("Meta OAuth is state-protected, encrypted, read-only, and live-validated", async () => {
  const [start, callback, meta, health, ui] = await Promise.all([
    readFile(new URL("../app/api/integrations/meta/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/meta/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(start, /crypto\.randomUUID/);
  assert.match(start, /stateHash/);
  assert.match(callback, /used_at IS NULL/);
  assert.match(callback, /encryptMetaToken/);
  assert.match(meta, /AES-GCM/);
  assert.match(meta, /pages_show_list/);
  assert.match(meta, /pages_read_engagement/);
  assert.match(meta, /instagram_basic/);
  assert.doesNotMatch(`${start}\n${callback}\n${meta}`, /pages_manage_posts|instagram_content_publish|instagram_manage_messages|instagram_manage_comments/);
  assert.match(health, /verifyMetaConnection/);
  assert.match(ui, /api\/integrations\/meta\/start/);
  assert.doesNotMatch(`${ui}\n${start}`, /NEXT_PUBLIC_.*META/);
});

test("generated media stays server-side and approval controls remain isolated", async () => {
  const [generation, media, hosting, ui] = await Promise.all([
    readFile(new URL("../app/api/media/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(generation, /getChatGPTUser/);
  assert.match(generation, /gpt-image-2/);
  assert.match(generation, /sora-2/);
  assert.match(generation, /private\/generated/);
  assert.match(media, /cache-control": "private, no-store/);
  assert.match(hosting, /"r2": "MEDIA"/);
  assert.match(ui, /Create with AI/);
  assert.match(ui, /readApiResponse/);
  assert.match(ui, /response\.status === 413/);
  assert.match(generation, /maxRequestBytes/);
  assert.match(generation, /maxPromptLength/);
  assert.doesNotMatch(`${generation}\n${ui}`, /NEXT_PUBLIC_.*OPENAI/);
  assert.doesNotMatch(generation, /api\/shopify/);
});
