ALTER TABLE `incidents` ADD `reportType` enum('incident','accident') DEFAULT 'incident';--> statement-breakpoint
ALTER TABLE `incidents` DROP COLUMN `locationTag`;