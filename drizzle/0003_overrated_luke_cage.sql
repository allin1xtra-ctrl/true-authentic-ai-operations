CREATE TABLE `media_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`source` text DEFAULT 'uploaded' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_attachments_object_key_unique` ON `media_attachments` (`object_key`);