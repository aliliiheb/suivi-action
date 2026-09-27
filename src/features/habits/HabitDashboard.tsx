import { useTranslation } from 'react-i18next';
import { Leaf, Flame, CircleCheck, BarChart3 } from 'lucide-react';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { dayKey } from '@/shared/lib/time';
import {
  habitDashboard,
  habitDayCounts,
  habitTarget,
  type HabitRows,
} from '@/domain/habits/dashboard';
import { isHabitDay } from '@/domain/habits/statistics';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
export interface HabitGardenArea {
  id: string;
  name: string;
  progress: number;
  count: number;
}
export function HabitGardenScene({
  areas,
  onSelect,
}: {
  areas: HabitGardenArea[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="habit-garden-scene">
      <div className="garden-intro">
        <h2>{t('habitStudio.garden')}</h2>
        <p>{t('habitStudio.gardenHint')}</p>
      </div>
      <div className="habit-plants">
        {areas.map((area) => (
          <button
            type="button"
            key={area.id}
            onClick={() => onSelect(area.id)}
            className="habit-plant"
          >
            <img src="/art/habit-plant.png" alt="" />
            <span>
              <strong>{area.name}</strong>
              <small>{Math.round(area.progress)}%</small>
              <ProgressBar value={area.progress} />
            </span>
          </button>
        ))}
      </div>
      {!areas.length && <p className="garden-empty">{t('habits.empty')}</p>}
    </section>
  );
}
export function HabitStats({ rows, date }: { rows: HabitRows; date: string }) {
  const { t } = useTranslation();
  const stats = habitDashboard(rows, date);
  return (
    <div className="habit-stats">
      {[
        [Leaf, stats.active, t('habitStudio.active')],
        [CircleCheck, `${stats.today.done} / ${stats.today.due}`, t('habitStudio.doneDate')],
        [BarChart3, `${Math.round(stats.weekly)}%`, t('habitStudio.weekly')],
        [Flame, stats.best, t('habitStudio.best')],
      ].map(([Icon, value, label]) => {
        const StatIcon = Icon as typeof Leaf;
        return (
          <div className="studio-panel habit-stat" key={String(label)}>
            <span>
              <StatIcon size={24} />
            </span>
            <div>
              <strong>{String(value)}</strong>
              <small>{String(label)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function HabitHistory({
  rows,
  date,
  onDate,
}: {
  rows: HabitRows;
  date: string;
  onDate: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const stats = habitDashboard(rows, date);
  const year = new Date(`${date}T12:00:00`).getFullYear();
  const first = new Date(year, 0, 1, 12);
  const total = differenceInCalendarDays(new Date(year, 11, 31, 12), first) + 1;
  return (
    <section className="studio-panel habit-history">
      <header>
        <h2>{t('habitStudio.week')}</h2>
        <small>{Math.round(stats.weekly)}%</small>
      </header>
      <div className="habit-week-scroll">
        <table className="habit-week">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t('habits.title')}</span>
              </th>
              {stats.week.map((day) => (
                <th scope="col" key={day.date}>
                  <time title={day.date}>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(i18n.language, {
                      weekday: 'narrow',
                    })}
                  </time>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.habit.id}>
                <th scope="row">{row.habit.title}</th>
                {stats.week.map((day) => {
                  const due = isHabitDay(row.habit, day.date) && row.habit.active;
                  const done =
                    (row.logs.find((log) => log.date === day.date)?.value ?? 0) >= habitTarget(row);
                  return (
                    <td key={day.date}>
                      <button
                        type="button"
                        data-level={due ? (done ? 'done' : 'empty') : 'off'}
                        onClick={() => onDate(day.date)}
                        aria-label={`${row.habit.title} · ${day.date} · ${t(!due ? 'habits.notScheduled' : done ? 'habits.done' : 'habitStudio.pending')}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="habit-year-heading">{t('habitStudio.year', { year })}</h3>
      <div className="habit-year-scroll">
        <div className="habit-months">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>
              {new Date(year, i, 1).toLocaleDateString(i18n.language, { month: 'short' })}
            </span>
          ))}
        </div>
        <div
          className="habit-heatmap"
          style={{
            gridTemplateColumns: `repeat(${Math.ceil((total + ((first.getDay() + 6) % 7)) / 7)}, 1fr)`,
          }}
        >
          {Array.from({ length: (first.getDay() + 6) % 7 }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: total }, (_, i) => {
            const key = dayKey(addDays(first, i));
            const counts = habitDayCounts(rows, key);
            const future = key > dayKey();
            return (
              <button
                type="button"
                key={key}
                disabled={future}
                data-level={
                  future
                    ? 'future'
                    : !counts.due
                      ? 'off'
                      : counts.percent === 0
                        ? 'empty'
                        : counts.percent < 50
                          ? 'low'
                          : counts.percent < 100
                            ? 'mid'
                            : 'done'
                }
                aria-label={`${key} · ${counts.done}/${counts.due}`}
                title={`${key} · ${counts.done}/${counts.due}`}
                onClick={() => onDate(key)}
              />
            );
          })}
        </div>
      </div>
      <p className="habit-heatmap-legend">{t('habitStudio.legend')}</p>
    </section>
  );
}
