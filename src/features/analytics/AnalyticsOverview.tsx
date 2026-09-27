import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { Flag, Download } from 'lucide-react';
import type { Report } from './ReportView';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey } from '@/shared/lib/time';
import { StudioPanel, StudioMeter } from '@/features/workspaces/Studio';
import { useWords } from '@/features/workspaces/useWords';
export function AnalyticsOverview({
  report,
  from,
  to,
}: {
  report: Report;
  from: string;
  to: string;
}) {
  const w = useWords(),
    { repos } = useDb(),
    [previous, setPrevious] = useState<Report | null>(null);
  useEffect(() => {
    let live = true;
    setPrevious(null);
    const days =
      differenceInCalendarDays(new Date(to + 'T12:00:00'), new Date(from + 'T12:00:00')) + 1;
    void repos.reports
      .report(
        dayKey(addDays(new Date(from + 'T12:00:00'), -days)),
        dayKey(addDays(new Date(from + 'T12:00:00'), -1)),
      )
      .then((r) => {
        if (live) setPrevious(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repos, from, to]);
  const goals = report.goals.filter((g) => !g.archivedAt),
    average = goals.length ? goals.reduce((s, g) => s + g.progress, 0) / goals.length : 0,
    areas = report.areas.filter((a) => !a.deletedAt && !a.archivedAt);
  const heat = Array.from({ length: 7 }, () => Array(8).fill(0) as number[]);
  for (const s of report.sessions)
    if (s.entryType === 'automatic') {
      const d = new Date(s.startedAt);
      heat[(d.getDay() + 6) % 7]![Math.floor(d.getHours() / 3)]! += s.durationMin;
    }
  const max = Math.max(1, ...heat.flat()),
    journey = [...goals].sort((a, b) => a.createdAt - b.createdAt).slice(-6);
  const exportReport = () => {
    const rows = [
      ['date', 'focus_minutes'],
      ...report.daily.map((d) => [d.date, String(d.minutes)]),
    ];
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(',')).join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `progress-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="insight-domain-strip">
        <div className="insight-index">
          <div
            className="insight-ring"
            style={{ background: `conic-gradient(#f1cb7c ${average}%,#203b49 0)` }}
          >
            <strong>{Math.round(average)}%</strong>
          </div>
          <small>
            {w('Moyenne actuelle des objectifs', 'Current goal average', 'متوسط الأهداف الحالي')}
          </small>
        </div>
        {areas.map((a) => {
          const gs = goals.filter((g) => g.areaId === a.id),
            p = gs.length ? gs.reduce((s, g) => s + g.progress, 0) / gs.length : 0;
          return (
            <Link to="/goals" className="insight-domain" key={a.id}>
              <Flag style={{ color: a.color ?? '#ddbd77' }} />
              <strong>{a.name}</strong>
              <b>{Math.round(p)}%</b>
              <small>
                {gs.length} {w('objectifs', 'goals', 'أهداف')}
              </small>
            </Link>
          );
        })}
      </div>
      <div className="insight-columns">
        <div className="atelier-stack">
          <section className="progress-landscape">
            <header>
              <h2>{w('Mon parcours', 'My journey', 'رحلتي')}</h2>
              <p>
                {w(
                  'Des étapes réelles, une progression continue.',
                  'Real milestones, continuous progress.',
                  'مراحل حقيقية وتقدم مستمر.',
                )}
              </p>
            </header>
            <div className="mountain-milestones">
              {journey.map((g, i) => (
                <Link
                  key={g.id}
                  to={`/goals/${g.id}`}
                  style={{ bottom: `${10 + i * 9}%`, left: `${4 + i * 15}%` }}
                >
                  <span>✦</span>
                  <strong>{g.title}</strong>
                  <small>
                    {Math.round(g.progress)}% · {new Date(g.createdAt).toLocaleDateString()}
                  </small>
                </Link>
              ))}
            </div>
            {!journey.length && (
              <Link className="landscape-empty" to="/goals">
                {w(
                  'Commencer avec un premier objectif →',
                  'Start with a first goal →',
                  'ابدأ بهدف أول ←',
                )}
              </Link>
            )}
          </section>
          <div className="atelier-bottom-three">
            <StudioPanel
              title={w(
                'Cette période / précédente',
                'This period / previous',
                'الفترة الحالية / السابقة',
              )}
            >
              {[
                [w('Focus (min)', 'Focus (min)', 'تركيز (د)'), report.minutes, previous?.minutes],
                [
                  w('Tâches terminées', 'Completed tasks', 'مهام مكتملة'),
                  report.completed.length,
                  previous?.completed.length,
                ],
                [
                  w('Régularité (%)', 'Regularity (%)', 'الانتظام (%)'),
                  report.regularity,
                  previous?.regularity,
                ],
              ].map(([label, current, old]) => (
                <div className="atelier-row" key={String(label)}>
                  <span>{label}</span>
                  <small>
                    {old === undefined ? '—' : Math.round(Number(old))} →{' '}
                    <b>{Math.round(Number(current))}</b>
                  </small>
                </div>
              ))}
              <p>
                {w(
                  'Comparaison avec la période précédente de même durée.',
                  'Compared with the preceding period of equal length.',
                  'مقارنة بالفترة السابقة ذات المدة نفسها.',
                )}
              </p>
            </StudioPanel>
            <StudioPanel
              title={w('Quand est-ce que je me concentre ?', 'When do I focus?', 'متى أركز؟')}
            >
              <div className="focus-heat" dir="ltr">
                <div />
                {Array.from({ length: 8 }, (_, i) => (
                  <small key={i}>{i * 3}h</small>
                ))}
                {heat.map((row, d) => (
                  <div className="heat-row" key={d}>
                    <small>
                      {new Date(2026, 8, 7 + d).toLocaleDateString(undefined, { weekday: 'short' })}
                    </small>
                    {row.map((n, h) => (
                      <span
                        key={h}
                        title={`${d + 1} · ${h * 3}h · ${n} min`}
                        style={{ background: `rgba(54,190,232,${0.08 + (n / max) * 0.92})` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p>
                {w(
                  'Durée des sessions automatiques regroupées par heure de début.',
                  'Automatic session duration grouped by start time.',
                  'مدة جلسات التركيز التلقائية حسب ساعة البدء.',
                )}
              </p>
            </StudioPanel>
            <StudioPanel title={w('Mes victoires récentes', 'Recent wins', 'إنجازاتي الأخيرة')}>
              {report.completed.slice(0, 4).map((task) => (
                <div className="atelier-row" key={task.id}>
                  ✓ {task.title}
                </div>
              ))}
              {!report.completed.length && (
                <p>
                  {w(
                    'Les tâches terminées apparaîtront ici.',
                    'Completed tasks will appear here.',
                    'ستظهر المهام المكتملة هنا.',
                  )}
                </p>
              )}
            </StudioPanel>
          </div>
        </div>
        <aside className="atelier-stack">
          <StudioPanel title={w('Où va mon temps ?', 'Where does my time go?', 'أين يذهب وقتي؟')}>
            {[...report.byArea].map(([id, min]) => (
              <div key={id} className="insight-distribution">
                <span>
                  {report.areas.find((a) => a.id === id)?.name ?? w('Autre', 'Other', 'أخرى')}
                </span>
                <b>{Math.round(min)} min</b>
                <StudioMeter value={report.minutes ? (min / report.minutes) * 100 : 0} />
              </div>
            ))}
            {!report.minutes && (
              <p>
                {w(
                  'Aucune session sur cette période.',
                  'No sessions in this period.',
                  'لا جلسات في هذه الفترة.',
                )}
              </p>
            )}
          </StudioPanel>
          <StudioPanel title={w('Prochaines échéances', 'Upcoming deadlines', 'المواعيد القادمة')}>
            {goals
              .filter((g) => g.deadline && g.progress < 100)
              .sort((a, b) => a.deadline! - b.deadline!)
              .slice(0, 5)
              .map((g) => (
                <Link className="atelier-row" to={`/goals/${g.id}`} key={g.id}>
                  <span>
                    {g.title}
                    <small>
                      {new Date(g.deadline!).toLocaleDateString()} ·{' '}
                      {g.deadline! < Date.now()
                        ? w('Échéance dépassée', 'Past deadline', 'تجاوز الموعد')
                        : w('À venir', 'Upcoming', 'قادم')}
                    </small>
                    <StudioMeter value={g.progress} />
                  </span>
                </Link>
              ))}
          </StudioPanel>
          <StudioPanel title={w('Explorer mes données', 'Explore my data', 'استكشف بياناتي')}>
            <Link className="atelier-wide-link" to="/coach">
              {w('Ouvrir mon Coach →', 'Open my Coach →', 'افتح مدربي ←')}
            </Link>
            <button className="atelier-wide-link" onClick={exportReport}>
              <Download size={16} />
              {w('Exporter le focus (CSV)', 'Export focus (CSV)', 'تصدير التركيز (CSV)')}
            </button>
            <Link className="atelier-row" to="/reviews">
              {w('Écrire mon bilan', 'Write my review', 'اكتب مراجعتي')}
            </Link>
          </StudioPanel>
        </aside>
      </div>
    </>
  );
}
