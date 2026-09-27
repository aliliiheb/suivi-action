import { useEffect, useState } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey } from '@/shared/lib/time';
import { Input } from '@/shared/ui/components/Input';
import { Button } from '@/shared/ui/components/Button';
import { ReportView, type Report } from '@/features/analytics/ReportView';

const empty = { wentWell: '', blocked: '', toImprove: '', nextPriorities: '' };
export function ReviewsPage() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [date, setDate] = useState(dayKey());
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly');
  const [answers, setAnswers] = useState(empty);
  const [report, setReport] = useState<Report>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const chosen = new Date(`${date}T12:00:00`);
  const from = dayKey(
    kind === 'weekly' ? startOfWeek(chosen, { weekStartsOn: 1 }) : startOfMonth(chosen),
  );
  const to = dayKey(
    kind === 'weekly' ? endOfWeek(chosen, { weekStartsOn: 1 }) : endOfMonth(chosen),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void Promise.all([repos.reports.report(from, to), repos.reports.review(kind, from)])
      .then(([report, review]) => {
        if (!active) return;
        setReport(report);
        const saved =
          review && 'notes' in review
            ? (JSON.parse(review.notes ?? '{}') as Partial<typeof empty>)
            : review;
        setAnswers({
          wentWell: saved && 'wentWell' in saved ? (saved.wentWell ?? '') : '',
          blocked: saved && 'blocked' in saved ? (saved.blocked ?? '') : '',
          toImprove: saved && 'toImprove' in saved ? (saved.toImprove ?? '') : '',
          nextPriorities: saved && 'nextPriorities' in saved ? (saved.nextPriorities ?? '') : '',
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [repos, from, to, kind]);
  const update = (key: keyof typeof empty, value: string) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (!report) return;
    void commit(() =>
      repos.reports.saveReview(kind, from, next, {
        minutes: report.minutes,
        completed: report.completed.length,
        regularity: report.regularity,
      }),
    ).catch((err) => {
      console.error(err);
      setError(true);
    });
  };
  return (
    <div className="page-stack">
      <div className="page-header">
        <h1 className="text-xl font-semibold">{t('reviews.title')}</h1>
        <div className="flex gap-2">
          {(['weekly', 'monthly'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={kind === value ? 'primary' : 'outline'}
              onClick={() => setKind(value)}
            >
              {t(`reviews.${value}`)}
            </Button>
          ))}
        </div>
      </div>
      <label className="block text-sm">
        {t('reviews.choosePeriod')}
        <Input
          type="date"
          className="mt-1 w-48"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
      </label>
      <p className="text-sm text-fg-muted">
        {from} — {to}
      </p>
      {error ? (
        <p role="alert" className="text-danger">
          {t('common.error')}
        </p>
      ) : null}
      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          <div className="review-answers grid md:grid-cols-2">
            {(Object.keys(empty) as (keyof typeof empty)[]).map((key) => (
              <label key={key} className="block text-sm font-medium">
                {t(`reviews.${key}`)}
                <textarea
                  className="mt-2 h-32 w-full rounded-lg border border-border bg-surface p-3 font-normal"
                  value={answers[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
              </label>
            ))}
          </div>
          {report ? <ReportView report={report} /> : null}
        </>
      )}
    </div>
  );
}
