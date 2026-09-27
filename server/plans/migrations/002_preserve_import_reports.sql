ALTER TABLE plan_imports ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE plan_imports DROP CONSTRAINT plan_imports_project_id_fkey;
ALTER TABLE plan_imports ADD CONSTRAINT plan_imports_project_id_fkey FOREIGN KEY (project_id) REFERENCES plan_projects(id) ON DELETE SET NULL;
