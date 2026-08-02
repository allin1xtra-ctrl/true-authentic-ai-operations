CREATE TABLE IF NOT EXISTS `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL UNIQUE,
	`account_label` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`scopes` text NOT NULL,
	`status` text NOT NULL,
	`connected_at` text NOT NULL,
	`last_checked` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`state_hash` text NOT NULL UNIQUE,
	`account_label` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
