import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GoalMetric, GoalWithArea } from '@/db/repositories/goals';
import { GOAL_METRICS, GoalValidationError, type GoalType } from '@/domain/goals/goalTypes';
import { useDb } from '@/app/providers/databaseContext';
import { Input } from '@/shared/ui/components/Input';
import { Button } from '@/shared/ui/components/Button';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';

function MetricCard({
  metric,
  type,
  onSave,
}: {
  metric: GoalMetric;
  type: GoalType;
  onSave: (current: number) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState(String(metric.current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const savedCurrent = metric.current;
  useEffect(() => {
    setCurrent(String(savedCurrent));
  }, [savedCurrent]);
  const definition = GOAL_METRICS[type].find((definition) => definition.key === metric.key);
  const number = (value: number) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const label = t(`goalTypes.metrics.${metric.key}`);
  const percentage = Math.min(100, (metric.current / metric.target) * 100);
  const save = async () => {
    if (busy) return;
    if (!current.trim()) {
      setError(t('goalTypes.errors.required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(Number(current));
    } catch (err) {
      setError(
        err instanceof GoalValidationError
          ? t(`goalTypes.errors.${err.reason}`)
          : t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="goal-metric surface space-y-3">
      <h3 className="font-medium">{label}</h3>
      <p className="text-xl font-semibold">
        {number(metric.current)}{' '}
        <span className="text-sm font-normal text-fg-muted">/ {number(metric.target)}</span>
      </p>
      <ProgressBar value={percentage} />
      <p className="text-xs text-fg-muted">
        {t('goalTypes.remaining', { value: number(Math.max(0, metric.target - metric.current)) })} ·{' '}
        {Math.round(percentage)}%
      </p>
      {metric.source === 'focus' ? (
        <p className="text-xs text-primary">{t('goalTypes.focusHelp')}</p>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-fg-muted">
            {t('goalTypes.current')}
            <Input
              className="mt-1"
              type="number"
              required
              min="0"
              step={definition?.integer ? '1' : 'any'}
              aria-label={`${label} — ${t('goalTypes.current')}`}
              value={current}
              disabled={busy}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError('');
              }}
            />
          </label>
          <Button type="submit" size="sm" disabled={busy || current === String(metric.current)}>
            {t('common.save')}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function GoalMetricsPanel({
  goal,
  onSaved,
}: {
  goal: GoalWithArea;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  if (!goal.metrics.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-heading">{t('goalTypes.measures')}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t('goalTypes.progressExplanation')}</p>
      </div>
      <div className="goal-metrics">
        {goal.metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            metric={metric}
            type={goal.goalType as GoalType}
            onSave={async (current) => {
              await commit(() => repos.goals.setMetricCurrent(goal.id, metric.key, current));
              await onSaved();
            }}
          />
        ))}
      </div>
    </section>
  );
}
