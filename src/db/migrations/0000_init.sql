CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`unlocked_at` integer,
	`progress` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievements_code_unique` ON `achievements` (`code`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`detail_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `daily_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`planned_min` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plans_date_unique` ON `daily_plans` (`date`);--> statement-breakpoint
CREATE INDEX `daily_plans_date_idx` ON `daily_plans` (`date`);--> statement-breakpoint
CREATE TABLE `daily_priorities` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`task_id` text NOT NULL,
	`rank` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daily_priorities_date_idx` ON `daily_priorities` (`date`,`rank`);--> statement-breakpoint
CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`goal_id` text,
	`step_id` text,
	`project_id` text,
	`area_id` text,
	`date` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_min` integer DEFAULT 0 NOT NULL,
	`paused_min` integer DEFAULT 0 NOT NULL,
	`comment` text,
	`entry_type` text DEFAULT 'automatic' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`step_id`) REFERENCES `goal_steps`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`area_id`) REFERENCES `life_areas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `focus_date_idx` ON `focus_sessions` (`date`);--> statement-breakpoint
CREATE INDEX `focus_goal_idx` ON `focus_sessions` (`goal_id`);--> statement-breakpoint
CREATE INDEX `focus_task_idx` ON `focus_sessions` (`task_id`);--> statement-breakpoint
CREATE INDEX `focus_area_idx` ON `focus_sessions` (`area_id`);--> statement-breakpoint
CREATE TABLE `goal_hybrid_components` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`kind` text NOT NULL,
	`weight` real NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_hybrid_goal_idx` ON `goal_hybrid_components` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goal_progress_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`date` text NOT NULL,
	`progress` real NOT NULL,
	`invested_min` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_goal_date_idx` ON `goal_progress_snapshots` (`goal_id`,`date`);--> statement-breakpoint
CREATE TABLE `goal_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`start_date` integer,
	`deadline` integer,
	`weight` real DEFAULT 1 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`invested_min` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_steps_goal_idx` ON `goal_steps` (`goal_id`);--> statement-breakpoint
CREATE INDEX `goal_steps_order_idx` ON `goal_steps` (`goal_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`area_id` text,
	`start_date` integer,
	`deadline` integer,
	`priority` text DEFAULT 'p3' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`color` text,
	`icon` text,
	`notes` text,
	`progress_method` text DEFAULT 'tasks' NOT NULL,
	`current_value` real,
	`target_value` real,
	`unit` text,
	`progress` real DEFAULT 0 NOT NULL,
	`manual_progress` real,
	`estimated_load_min` integer,
	`invested_min` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`area_id`) REFERENCES `life_areas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goals_area_idx` ON `goals` (`area_id`);--> statement-breakpoint
CREATE INDEX `goals_status_idx` ON `goals` (`status`);--> statement-breakpoint
CREATE INDEX `goals_deadline_idx` ON `goals` (`deadline`);--> statement-breakpoint
CREATE INDEX `goals_deleted_idx` ON `goals` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real DEFAULT 1 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `habit_logs_habit_date_idx` ON `habit_logs` (`habit_id`,`date`);--> statement-breakpoint
CREATE INDEX `habit_logs_date_idx` ON `habit_logs` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`area_id` text,
	`goal_id` text,
	`tracking` text DEFAULT 'boolean' NOT NULL,
	`target_value` real,
	`unit` text,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`days_of_week` text,
	`preferred_time_min` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`area_id`) REFERENCES `life_areas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `habits_area_idx` ON `habits` (`area_id`);--> statement-breakpoint
CREATE INDEX `habits_active_idx` ON `habits` (`active`);--> statement-breakpoint
CREATE TABLE `life_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `life_areas_order_idx` ON `life_areas` (`sort_order`);--> statement-breakpoint
CREATE INDEX `life_areas_deleted_idx` ON `life_areas` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `monthly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`notes` text,
	`metrics_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_reviews_month_unique` ON `monthly_reviews` (`month`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_goal_idx` ON `notes` (`goal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`avatar_path` text,
	`language` text DEFAULT 'fr' NOT NULL,
	`timezone` text,
	`week_starts_on` integer DEFAULT 1 NOT NULL,
	`time_format` text DEFAULT '24h' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`workday_start_min` integer,
	`workday_end_min` integer,
	`daily_focus_goal_min` integer DEFAULT 120 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text,
	`title` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`start_date` integer,
	`deadline` integer,
	`weight` real DEFAULT 1 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`invested_min` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_goal_idx` ON `projects` (`goal_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_task_idx` ON `subtasks` (`task_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_tags_task_idx` ON `task_tags` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`goal_id` text,
	`step_id` text,
	`project_id` text,
	`priority` text DEFAULT 'p3' NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`planned_date` integer,
	`deadline` integer,
	`estimated_min` integer,
	`spent_min` integer DEFAULT 0 NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`recurrence_rule` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`step_id`) REFERENCES `goal_steps`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_goal_idx` ON `tasks` (`goal_id`);--> statement-breakpoint
CREATE INDEX `tasks_step_idx` ON `tasks` (`step_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_planned_idx` ON `tasks` (`planned_date`);--> statement-breakpoint
CREATE INDEX `tasks_deadline_idx` ON `tasks` (`deadline`);--> statement-breakpoint
CREATE INDEX `tasks_deleted_idx` ON `tasks` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`went_well` text,
	`blocked` text,
	`to_improve` text,
	`next_priorities` text,
	`metrics_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_week_start_unique` ON `weekly_reviews` (`week_start`);