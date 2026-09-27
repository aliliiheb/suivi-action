ALTER TABLE goals ADD COLUMN goal_type text NOT NULL DEFAULT 'custom';
--> statement-breakpoint
CREATE TABLE goal_metrics (
  id text PRIMARY KEY NOT NULL,
  goal_id text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  key text NOT NULL,
  target real NOT NULL CHECK(target > 0),
  current real NOT NULL DEFAULT 0 CHECK(current >= 0),
  weight real NOT NULL CHECK(weight > 0 AND weight <= 100),
  source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'focus')),
  active integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX goal_metrics_key_idx ON goal_metrics(goal_id, key);
