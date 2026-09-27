import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportsRepository } from '@/db/repositories/reports';
import { plannedVsActual } from '@/domain/progress/progressEngine';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { useReducedMotion } from '@/shared/ui/useReducedMotion';

export type Report = Awaited<ReturnType<ReportsRepository['report']>>;
export function ReportView({ report }: { report: Report }) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const cards = [
    [t('analytics.focusTime'), `${Number(report.minutes.toFixed(1))} ${t('common.minShort')}`],
    [t('analytics.completed'), String(report.completed.length)],
    [t('analytics.average'), `${Number(report.average.toFixed(1))} ${t('common.minShort')}`],
    [t('analytics.regularity'), `${Math.round(report.regularity)}%`],
  ];
  const distribution = [...report.byArea]
    .map(([id, minutes]) => ({
      id,
      name: report.areas.find((area) => area.id === id)?.name ?? t('goals.noArea'),
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);
  return (
    <div className="report-grid">
      <div className="metric-grid grid grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="metric-card surface">
            <p className="text-xs text-fg-muted">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-fg-muted">
        {t('analytics.regularityExplanation', {
          days: report.activeDays,
          total: report.daily.length,
        })}
      </p>
      <div className="chart-panel surface">
        <h2 className="mb-4 font-semibold">{t('analytics.dailyFocus')}</h2>
        {report.minutes > 0 ? (
          <div className="chart-canvas" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.daily}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  tickFormatter={(date: string) =>
                    new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, {
                      day: 'numeric',
                      month: 'short',
                    })
                  }
                  tick={{ fontSize: 11, fill: 'hsl(var(--fg-muted))' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--fg-muted))' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--surface))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--fg))',
                  }}
                />
                <Bar
                  isAnimationActive={!reducedMotion}
                  animationDuration={800}
                  dataKey="minutes"
                  name={t('analytics.focusTime')}
                  fill="hsl(var(--primary))"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-fg-muted">{t('analytics.empty')}</p>
        )}
        <details className="mt-2 text-xs text-fg-muted">
          <summary>{t('analytics.showValues')}</summary>
          <ul className="mt-2 max-h-48 overflow-y-auto">
            {report.daily.map((day) => (
              <li key={day.date}>
                {day.date} · {Number(day.minutes.toFixed(1))} {t('common.minShort')}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="report-secondary grid gap-4 md:grid-cols-2">
        <section className="surface space-y-3">
          <h2 className="font-semibold">{t('analytics.distribution')}</h2>
          {distribution.length ? (
            distribution.map((area) => (
              <div key={area.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>{area.name}</span>
                  <span>
                    {Number(area.minutes.toFixed(1))} {t('common.minShort')}
                  </span>
                </div>
                <ProgressBar value={report.minutes ? (area.minutes / report.minutes) * 100 : 0} />
              </div>
            ))
          ) : (
            <p className="text-sm text-fg-muted">{t('analytics.empty')}</p>
          )}
        </section>
        <section className="surface space-y-3">
          <h2 className="font-semibold">{t('analytics.planning')}</h2>
          <p className="text-sm">
            {t('analytics.planCompletion', { percent: Math.round(report.completionRate) })}
          </p>
          <ProgressBar value={report.completionRate} />
          <p className="text-sm">{t('analytics.estimated', { minutes: report.estimatedMin })}</p>
          <p className="text-sm">
            {t('analytics.actual', { minutes: Number(report.minutes.toFixed(1)) })}
          </p>
          <p className="text-xs text-fg-muted">{t('analytics.planExplanation')}</p>
        </section>
      </div>
      <section className="report-goals">
        <h2 className="font-semibold">{t('analytics.currentGoals')}</h2>
        {report.goals.map((goal) => {
          const pace =
            goal.startDate !== null && goal.deadline !== null
              ? plannedVsActual({
                  startMs: goal.startDate,
                  deadlineMs: goal.deadline,
                  nowMs: Date.now(),
                  actual: goal.progress,
                })
              : null;
          return (
            <div key={goal.id} className="surface p-5">
              <div className="mb-2 flex justify-between gap-3">
                <Link className="font-medium hover:text-primary" to={`/goals/${goal.id}`}>
                  {goal.title}
                </Link>
                <span>{Math.round(goal.progress)}%</span>
              </div>
              <ProgressBar value={goal.progress} />
              <p className="mt-2 text-xs text-fg-muted">
                {Number((report.byGoal.get(goal.id) ?? 0).toFixed(1))} {t('common.minShort')} ·{' '}
                {t('analytics.inPeriod')}
              </p>
              {pace ? (
                <p className="mt-1 text-sm">
                  {t(`analytics.${pace.pace}`)} ·{' '}
                  {t('analytics.expected', { percent: pace.expected, delta: pace.delta })}
                </p>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
