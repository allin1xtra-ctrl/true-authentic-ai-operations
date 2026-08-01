CREATE TABLE `media_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text NOT NULL,
	`provider_id` text,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`attachment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
