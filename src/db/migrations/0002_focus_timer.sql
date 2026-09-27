ALTER TABLE focus_sessions ADD COLUMN state text NOT NULL DEFAULT 'stopped';
--> statement-breakpoint
ALTER TABLE focus_sessions ADD COLUMN elapsed_ms real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE focus_sessions ADD COLUMN paused_ms real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE focus_sessions ADD COLUMN last_tick_at integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE focus_sessions ADD COLUMN target_min integer;
--> statement-breakpoint
ALTER TABLE focus_sessions ADD COLUMN recovered integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE focus_sessions SET elapsed_ms = duration_min * 60000, paused_ms = paused_min * 60000, last_tick_at = COALESCE(ended_at, started_at), state = CASE WHEN ended_at IS NULL THEN 'paused' ELSE 'stopped' END;
--> statement-breakpoint
CREATE UNIQUE INDEX focus_one_active_idx ON focus_sessions((1)) WHERE ended_at IS NULL;
