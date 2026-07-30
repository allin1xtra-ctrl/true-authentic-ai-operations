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
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, role TEXT NOT NULL,
      message TEXT NOT NULL, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
      explanation TEXT NOT NULL, capabilities TEXT NOT NULL, last_checked TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, event TEXT NOT NULL,
      detail TEXT NOT NULL, created_at TEXT NOT NULL)`),
  ]);
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
