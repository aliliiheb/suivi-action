ALTER TABLE daily_plans ADD COLUMN capacity_min integer NOT NULL DEFAULT 480;
--> statement-breakpoint
CREATE UNIQUE INDEX daily_priority_task_idx ON daily_priorities(date, task_id);
--> statement-breakpoint
CREATE UNIQUE INDEX daily_priority_rank_idx ON daily_priorities(date, rank);
