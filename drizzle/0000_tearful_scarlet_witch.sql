CREATE TABLE `painting_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `painting_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`updated_at` integer NOT NULL
);
