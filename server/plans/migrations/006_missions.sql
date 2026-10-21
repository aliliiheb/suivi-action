CREATE TABLE plan_missions (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 client_id text NOT NULL REFERENCES plan_clients(id),
 manager_id text NOT NULL REFERENCES plan_users(id),
 number text GENERATED ALWAYS AS (upper(btrim(data->>'number'))) STORED NOT NULL UNIQUE,
 project_id text GENERATED ALWAYS AS (NULLIF(data->>'project_id','')) STORED REFERENCES plan_projects(id)
);
CREATE INDEX plan_missions_client ON plan_missions(client_id);
ALTER TABLE plan_projects ADD COLUMN mission_id text GENERATED ALWAYS AS (NULLIF(data->>'mission_id','')) STORED REFERENCES plan_missions(id);
ALTER TABLE plan_modules ADD COLUMN mission_id text GENERATED ALWAYS AS (NULLIF(data->>'mission_id','')) STORED REFERENCES plan_missions(id);
ALTER TABLE plan_actions ADD COLUMN mission_id text GENERATED ALWAYS AS (NULLIF(data->>'mission_id','')) STORED REFERENCES plan_missions(id);
CREATE INDEX plan_projects_mission ON plan_projects(mission_id);
CREATE INDEX plan_modules_mission ON plan_modules(mission_id);
CREATE INDEX plan_actions_mission ON plan_actions(mission_id);
ALTER TABLE plan_documents ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE plan_documents ADD COLUMN mission_id text REFERENCES plan_missions(id);
ALTER TABLE plan_documents ADD CONSTRAINT document_owner CHECK ((project_id IS NOT NULL)::integer + (mission_id IS NOT NULL)::integer = 1);
CREATE INDEX plan_documents_mission ON plan_documents(mission_id);
ALTER TABLE plan_duplications DROP CONSTRAINT plan_duplications_kind_check;
ALTER TABLE plan_duplications ADD CONSTRAINT plan_duplications_kind_check CHECK(kind IN ('projects','modules','actions','missions'));
