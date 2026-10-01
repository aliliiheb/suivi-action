UPDATE plan_actions
SET data = '{"deadline_2":"","deadline_3":""}'::jsonb || data
WHERE NOT (data ? 'deadline_2') OR NOT (data ? 'deadline_3');
