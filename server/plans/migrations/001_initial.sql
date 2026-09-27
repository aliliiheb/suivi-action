CREATE TABLE IF NOT EXISTS plan_migrations (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS plan_write_lock (id integer PRIMARY KEY);
INSERT INTO plan_write_lock VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS plan_users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('ADMIN','CHEF','PILOTE')),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS plan_clients (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 code text GENERATED ALWAYS AS (data->>'code') STORED UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_projects (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 client_id text NOT NULL REFERENCES plan_clients(id), manager_id text NOT NULL REFERENCES plan_users(id),
 code text GENERATED ALWAYS AS (data->>'code') STORED NOT NULL, UNIQUE(client_id,code)
);
CREATE TABLE IF NOT EXISTS plan_members (
 project_id text REFERENCES plan_projects(id) ON DELETE CASCADE,
 user_id text REFERENCES plan_users(id), PRIMARY KEY(project_id,user_id)
);
CREATE TABLE IF NOT EXISTS plan_modules (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 project_id text NOT NULL REFERENCES plan_projects(id),
 code text GENERATED ALWAYS AS (data->>'code') STORED NOT NULL, UNIQUE(project_id,code)
);
CREATE TABLE IF NOT EXISTS plan_actions (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 module_id text NOT NULL REFERENCES plan_modules(id), pilot_id text NOT NULL REFERENCES plan_users(id),
 code text GENERATED ALWAYS AS (data->>'code') STORED NOT NULL, UNIQUE(module_id,code),
 CHECK ((data->>'progress')::numeric BETWEEN 0 AND 100),
 CHECK (data->>'status' IN ('À faire','En cours','Terminée','Bloquée'))
);
CREATE TABLE IF NOT EXISTS plan_audit (
 id text PRIMARY KEY, entity_id text NOT NULL, project_id text,
 actor_id text NOT NULL REFERENCES plan_users(id), at timestamptz NOT NULL DEFAULT now(),
 operation text NOT NULL, before_data jsonb, after_data jsonb
);
CREATE INDEX IF NOT EXISTS plan_audit_entity ON plan_audit(entity_id,at);
CREATE INDEX IF NOT EXISTS plan_actions_module ON plan_actions(module_id);
CREATE INDEX IF NOT EXISTS plan_members_user ON plan_members(user_id);
CREATE TABLE IF NOT EXISTS plan_sessions (sid text PRIMARY KEY, data jsonb NOT NULL, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS plan_imports (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES plan_projects(id),
 actor_id text NOT NULL REFERENCES plan_users(id), at timestamptz NOT NULL DEFAULT now(),
 filename text NOT NULL, state text NOT NULL, data jsonb NOT NULL
);
INSERT INTO plan_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
