import { neon } from "@neondatabase/serverless";
import { pbkdf2 as pbkdf2Callback, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { passwordPolicyValid } from "../lib/account-policy.mjs";

const pbkdf2 = promisify(pbkdf2Callback);
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const privateEnvironmentMode = process.argv.includes("--private-env");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Run this command only from a private, trusted terminal.");
}
if (!stdin.isTTY || !stdout.isTTY) {
  throw new Error("Interactive terminal required; redirected input is intentionally rejected.");
}

function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    let value = "";
    const previousRawMode = stdin.isRaw;
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(previousRawMode));
      stdout.write("\n");
    };
    const onData = (key) => {
      if (key === "\u0003") {
        finish();
        reject(new Error("Cancelled."));
      } else if (key === "\r" || key === "\n") {
        finish();
        resolve(value);
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (!key.startsWith("\u001b")) {
        value += key;
      }
    };
    stdin.on("data", onData);
  });
}

async function hashPassword(password) {
  const iterations = 210_000;
  const salt = randomBytes(16);
  const digest = await pbkdf2(password, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${salt.toString("hex")}$${digest.toString("hex")}`;
}

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const displayName = privateEnvironmentMode ? String(process.env.OWNER_PROVISION_NAME || "").trim() : (await prompt.question("Owner name: ")).trim();
  const organizationName = privateEnvironmentMode ? String(process.env.OWNER_PROVISION_ORGANIZATION || "").trim() : (await prompt.question("Organization: ")).trim();
  const email = (privateEnvironmentMode ? String(process.env.OWNER_PROVISION_EMAIL || "") : await prompt.question("Owner email: ")).trim().toLowerCase();
  if (!privateEnvironmentMode) prompt.pause();
  const password = privateEnvironmentMode ? String(process.env.OWNER_PROVISION_PASSWORD || "") : await hiddenPrompt("Password (hidden, 12-256 characters): ");
  const confirmation = privateEnvironmentMode ? String(process.env.OWNER_PROVISION_CONFIRMATION || "") : await hiddenPrompt("Confirm password (hidden): ");

  if (!displayName || !organizationName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid name, organization, and email are required.");
  }
  if (!passwordPolicyValid(password, confirmation)) {
    throw new Error("Passwords must match and contain 12-256 characters.");
  }

  const sql = neon(databaseUrl);
  const schema = await sql`SELECT to_regclass('public.users') AS users`;
  if (!schema[0]?.users) {
    const migration = await readFile(new URL("../migrations/postgres/0001_foundation.sql", import.meta.url), "utf8");
    const statements = migration.split(";").map((part) => part.trim()).filter(Boolean);
    await sql.transaction(statements.map((statement) => sql.query(statement)));
  }

  const userId = randomUUID();
  const organizationId = randomUUID();
  const passwordDigest = await hashPassword(password);
  const result = await sql`WITH available AS (
    SELECT 1 AS allowed WHERE NOT EXISTS (SELECT 1 FROM users)
  ), organization AS (
    INSERT INTO organizations(id,name,slug)
    SELECT ${organizationId},${organizationName},'true-authentic' FROM available RETURNING id
  ), app_user AS (
    INSERT INTO users(id,email,display_name,password_hash)
    SELECT ${userId},${email},${displayName},${passwordDigest} FROM available RETURNING id
  ), membership AS (
    INSERT INTO organization_memberships(organization_id,user_id,role)
    SELECT organization.id,app_user.id,'owner' FROM organization CROSS JOIN app_user RETURNING organization_id,user_id
  ), audit AS (
    INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,outcome,metadata)
    SELECT ${randomUUID()},membership.organization_id,membership.user_id,'owner.provision','user',membership.user_id,'allowed','{"source":"private-cli"}'::jsonb
    FROM membership RETURNING id
  ) SELECT app_user.id FROM app_user CROSS JOIN audit`;

  if (!result.length) throw new Error("An owner already exists; no account was changed.");
  stdout.write("Owner created. Sign in through /login.\n");
} finally {
  prompt.close();
}
