/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "cloudflare:workers";

export type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): any;
    run(): Promise<any>;
    all<T>(): Promise<{ results: T[] }>;
    first<T>(): Promise<T | null>;
  };
  batch(statements: unknown[]): Promise<unknown[]>;
};

export function getStore(): D1Like {
  if (!env.DB) throw new Error("Persistent storage is not connected.");
  return env.DB as unknown as D1Like;
}

export async function ensureSchema(db = getStore()) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      agent_id TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL,
      due_date TEXT, integration TEXT, approval_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, content TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, action_type TEXT NOT NULL,
      summary TEXT NOT NULL, reason TEXT NOT NULL, exact_change TEXT NOT NULL,
      target_platform TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
      execution_result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, conversation_id TEXT, agent_id TEXT NOT NULL,
      role TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
      explanation TEXT NOT NULL, capabilities TEXT NOT NULL, last_checked TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, event TEXT NOT NULL,
      detail TEXT NOT NULL, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS integration_connections (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, account_label TEXT NOT NULL,
      encrypted_token TEXT NOT NULL, scopes TEXT NOT NULL, status TEXT NOT NULL,
      connected_at TEXT NOT NULL, last_checked TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, state_hash TEXT NOT NULL UNIQUE,
      account_label TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_attachments (
      id TEXT PRIMARY KEY, context_type TEXT NOT NULL, context_id TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'uploaded', created_at TEXT NOT NULL)`),
    db.prepare("CREATE INDEX IF NOT EXISTS media_context_idx ON media_attachments(context_type, context_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_generations (
      id TEXT PRIMARY KEY, context_type TEXT NOT NULL, context_id TEXT NOT NULL,
      kind TEXT NOT NULL, prompt TEXT NOT NULL, provider_id TEXT, status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0, attachment_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare("CREATE INDEX IF NOT EXISTS generation_context_idx ON media_generations(context_type, context_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS automation_schedules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, agent_id TEXT NOT NULL, instruction TEXT NOT NULL,
      cadence TEXT NOT NULL, daily_time TEXT, timezone TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT, next_run_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare("CREATE INDEX IF NOT EXISTS automation_due_idx ON automation_schedules(enabled, next_run_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, agent_id TEXT NOT NULL, status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1, output TEXT, error TEXT, started_at TEXT NOT NULL,
      completed_at TEXT, created_at TEXT NOT NULL)`),
    db.prepare("CREATE INDEX IF NOT EXISTS automation_runs_schedule_idx ON automation_runs(schedule_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL, status TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL, read_at TEXT)`),
    db.prepare("CREATE INDEX IF NOT EXISTS inbox_status_idx ON inbox_items(status, created_at)"),
  ]);

  // Existing Sites databases may predate durable workspace history. D1 has no
  // `ADD COLUMN IF NOT EXISTS`, so only ignore the duplicate-column condition.
  for (const statement of [
    "ALTER TABLE conversations ADD COLUMN conversation_id TEXT",
    "ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'",
  ]) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
  }
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
