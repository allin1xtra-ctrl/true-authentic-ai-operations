import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("employee workspace calls the real backend", async () => {
  const source = await readFile(new URL("../app/OperationsPlatform.tsx", import.meta.url), "utf8");
  for (const employee of ["Monroe", "Sage", "Cleo", "Lennox", "Avery"]) assert.match(source, new RegExp(employee));
  assert.match(source, /fetch\("\/api\/agent"/);
  assert.match(source, /Open employee/);
  assert.match(source, /AI connection required/);
});

test("agent API enforces approval and a consistent contract", async () => {
  const source = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");
  assert.match(source, /awaiting_approval/);
  assert.match(source, /approvalRequired/);
  assert.match(source, /proposedActions/);
  assert.match(source, /Nothing has been executed/);
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
});
