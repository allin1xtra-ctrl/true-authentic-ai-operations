CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`account_label` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`scopes` text NOT NULL,
	`status` text NOT NULL,
	`connected_at` text NOT NULL,
	`last_checked` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_connections_provider_unique` ON `integration_connections` (`provider`);
