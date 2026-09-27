import { AnalyticsOverview } from './AnalyticsOverview';
import { useWords } from '@/features/workspaces/useWords';
import { useEffect, useState } from 'react';
import { addDays, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey } from '@/shared/lib/time';
import { Input } from '@/shared/ui/components/Input';
import { ReportView, type Report } from './ReportView';

export function AnalyticsPage() {
  const { t } = useTranslation();
  const w = useWords();
  const { repos } = useDb();
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -6)));
  const [to, setTo] = useState(dayKey());
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    setReport(undefined);
    if (!from || !to || from > to) {
      setError(true);
      return;
    }
    void repos.reports
      .report(from, to)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err) => {
        console.error(err);
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [from, to, repos]);
  const preset = (value: string) => {
    const now = new Date();
    const start =
      value === 'month'
        ? startOfMonth(now)
        : value === 'quarter'
          ? startOfQuarter(now)
          : value === 'year'
            ? startOfYear(now)
            : addDays(now, 1 - Number(value));
    setFrom(dayKey(start));
    setTo(dayKey(now));
  };
  return (
    <div className="page-stack atelier-page insights-atelier">
      <div className="page-header">
        <div className="atelier-title">
          <div>
            <h1>{w('Ma Progression', 'My Progress', 'تقدمي')}</h1>
            <p>
              {w(
                'Comprends ton passé. Mesure ton présent. Améliore ton avenir.',
                'Understand your past. Measure your present. Improve your future.',
                'افهم ماضيك. قس حاضرك. حسّن مستقبلك.',
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="filter-bar">
        <label className="text-sm">
          {t('analytics.period')}
          <select
            className="mt-1 block h-10 rounded-md border border-border bg-surface px-3"
            defaultValue="7"
            onChange={(e) => preset(e.target.value)}
          >
            {['1', '7', '30', 'month', 'quarter', 'year'].map((key) => (
              <option key={key} value={key}>
                {t(`analytics.period_${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('analytics.from')}
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          {t('analytics.to')}
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-danger">
          {t('analytics.invalidRange')}
        </p>
      ) : report ? (
        <>
          <AnalyticsOverview report={report} from={from} to={to} />
          <details className="atelier-panel">
            <summary>{w('Rapport détaillé', 'Detailed report', 'التقرير المفصل')}</summary>
            <ReportView report={report} />
          </details>
        </>
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </div>
  );
}
