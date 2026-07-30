import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), title: text("title").notNull(), description: text("description").notNull(),
  agentId: text("agent_id").notNull(), priority: text("priority").notNull(), status: text("status").notNull(),
  dueDate: text("due_date"), integration: text("integration"), approvalRequired: integer("approval_required").notNull().default(0),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const memories = sqliteTable("memories", { id: text("id").primaryKey(), category: text("category").notNull(), content: text("content").notNull(), approved: integer("approved").notNull().default(1), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
export const approvals = sqliteTable("approvals", { id: text("id").primaryKey(), agentId: text("agent_id").notNull(), actionType: text("action_type").notNull(), summary: text("summary").notNull(), reason: text("reason").notNull(), exactChange: text("exact_change").notNull(), targetPlatform: text("target_platform").notNull(), payload: text("payload").notNull(), status: text("status").notNull(), executionResult: text("execution_result"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
export const conversations = sqliteTable("conversations", { id: text("id").primaryKey(), agentId: text("agent_id").notNull(), role: text("role").notNull(), message: text("message").notNull(), createdAt: text("created_at").notNull() });
export const integrations = sqliteTable("integrations", { id: text("id").primaryKey(), name: text("name").notNull(), status: text("status").notNull(), explanation: text("explanation").notNull(), capabilities: text("capabilities").notNull(), lastChecked: text("last_checked") });
export const activity = sqliteTable("activity", { id: text("id").primaryKey(), agentId: text("agent_id").notNull(), event: text("event").notNull(), detail: text("detail").notNull(), createdAt: text("created_at").notNull() });
