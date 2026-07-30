CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`event` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`action_type` text NOT NULL,
	`summary` text NOT NULL,
	`reason` text NOT NULL,
	`exact_change` text NOT NULL,
	`target_platform` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`execution_result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`role` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`explanation` text NOT NULL,
	`capabilities` text NOT NULL,
	`last_checked` text
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`approved` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`agent_id` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`due_date` text,
	`integration` text,
	`approval_required` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
