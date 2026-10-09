UPDATE plan_actions SET data = '{"location":"","location_other":"","mission_number":"","priority_reference":""}'::jsonb || data;
UPDATE plan_modules SET data = '{"parent_module_id":""}'::jsonb || data;
ALTER TABLE plan_modules ADD COLUMN parent_module_id text GENERATED ALWAYS AS (NULLIF(data->>'parent_module_id', '')) STORED REFERENCES plan_modules(id) ON DELETE RESTRICT;
ALTER TABLE plan_modules ADD CONSTRAINT module_not_own_parent CHECK (parent_module_id IS DISTINCT FROM id);
CREATE INDEX plan_modules_parent ON plan_modules(parent_module_id);
