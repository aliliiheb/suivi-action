-- Goal measures now contribute equally. Retain the legacy column for backup compatibility.
UPDATE goal_metrics
SET weight = 100.0 / (SELECT COUNT(*) FROM goal_metrics AS other
                     WHERE other.goal_id = goal_metrics.goal_id AND other.active = 1)
WHERE active = 1;

-- Refresh cached values immediately, including archived goals restored later.
UPDATE goals
SET progress = COALESCE((
  SELECT AVG(MIN(1.0, MAX(0.0, current / target))) * 100.0
  FROM goal_metrics WHERE goal_id = goals.id AND active = 1
), 0)
WHERE progress_method = 'metrics';
