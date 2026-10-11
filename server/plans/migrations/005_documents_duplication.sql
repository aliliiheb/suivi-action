CREATE TABLE plan_documents (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
 title text NOT NULL, filename text NOT NULL, mime text NOT NULL,
 size integer NOT NULL CHECK(size > 0 AND size <= 5242880),
 content bytea NOT NULL CHECK(octet_length(content)=size),
 uploaded_by text NOT NULL REFERENCES plan_users(id),
 at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 request_id text NOT NULL, UNIQUE(uploaded_by,request_id)
);
CREATE INDEX plan_documents_project ON plan_documents(project_id);
CREATE TABLE plan_duplications (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('projects','modules','actions')),
 source_id text NOT NULL, target_id text NOT NULL UNIQUE,
 actor_id text NOT NULL REFERENCES plan_users(id),
 at timestamptz NOT NULL DEFAULT now(), request_id text NOT NULL,
 request_hash text NOT NULL, UNIQUE(actor_id,request_id)
);
