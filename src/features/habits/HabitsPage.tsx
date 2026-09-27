import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { Habit, HabitRepository } from '@/db/repositories/habits';
import { isHabitDay } from '@/domain/habits/statistics';
import { dayKey } from '@/shared/lib/time';
import { useAction } from '@/shared/lib/useAction';
import { Link } from 'react-router-dom';
import { Leaf, Plus, ArrowRight, Play, Clock, Flame } from 'lucide-react';
import { HabitGardenScene, HabitStats, HabitHistory, type HabitGardenArea } from './HabitDashboard';
import { habitDashboard } from '@/domain/habits/dashboard';
import { ProgressRing } from '@/shared/ui/components/ProgressRing';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { HabitForm } from './HabitForm';

type Row = Awaited<ReturnType<HabitRepository['summary']>>[number];

function HabitCard({
  row,
  date,
  onSave,
  children,
}: {
  row: Row;
  date: string;
  onSave: (value: number) => Promise<void>;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { habit, stats, value } = row;
  const [input, setInput] = useState(String(value));
  const { run, busy, error } = useAction();
  const due = isHabitDay(habit, date) && habit.active;
  const target = habit.tracking === 'boolean' ? 1 : (habit.targetValue ?? 1);
  useEffect(() => setInput(String(value)), [value, date]);
  return (
    <div className="habit-card surface space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{habit.title}</h3>
          {habit.description ? <p className="text-sm text-fg-muted">{habit.description}</p> : null}
        </div>
        {children}
      </div>
      <p className="text-xs text-fg-muted">
        {t('habits.streak', { current: stats.current, best: stats.best })} ·{' '}
        {t('habits.success', { percent: Math.round(stats.successRate) })}
      </p>
      {due ? (
        habit.tracking === 'boolean' ? (
          <Button
            aria-pressed={value >= 1}
            disabled={busy}
            variant={value >= 1 ? 'primary' : 'outline'}
            onClick={() => void run(() => onSave(value >= 1 ? 0 : 1))}
          >
            {t(value >= 1 ? 'habits.done' : 'habits.markDone')}
          </Button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => onSave(Number(input)));
            }}
          >
            <label className="text-sm">
              {habit.unit || t(habit.tracking === 'duration' ? 'common.minShort' : 'habits.value')}
              <Input
                className="w-28"
                type="number"
                min="0"
                step="any"
                required
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </label>
            <span className="pb-2 text-sm text-fg-muted">/ {target}</span>
            <Button type="submit" size="sm" disabled={busy}>
              {t('common.save')}
            </Button>
          </form>
        )
      ) : (
        <p className="text-sm text-fg-muted">
          {t(habit.active ? 'habits.notScheduled' : 'habits.paused')}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {t('common.error')}
        </p>
      ) : null}
    </div>
  );
}

export function HabitsToday() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(dayKey());
  const reload = useCallback(
    async () =>
      setRows(
        (await repos.habits.summary()).filter(
          (row) => row.habit.active && isHabitDay(row.habit, dayKey()),
        ),
      ),
    [repos],
  );
  useEffect(() => {
    void reload().catch(console.error);
  }, [reload, date]);
  useEffect(() => {
    const timer = window.setInterval(() => setDate(dayKey()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!rows.length)
    return (
      <section className="habits-today space-y-3">
        <h2 className="section-heading">{t('habits.today')}</h2>
        <p className="text-sm text-fg-muted">{t('habits.empty')}</p>
        <Link className="studio-text-link" to="/habits">
          {t('habits.new')}
          <Plus size={15} />
        </Link>
      </section>
    );
  return (
    <section className="habits-today space-y-3">
      <h2 className="section-heading">{t('habits.today')}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <HabitCard
            key={row.habit.id}
            row={row}
            date={date}
            onSave={async (value) => {
              await commit(() => repos.habits.log(row.habit.id, date, value));
              await reload();
            }}
          />
        ))}
      </div>
      <Link className="studio-text-link" to="/habits">
        {t('habitStudio.title')}
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}

export function HabitsPage() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(dayKey());
  const [editing, setEditing] = useState<Habit | null | undefined>();
  const [goals, setGoals] = useState<{ id: string; title: string; areaId: string | null }[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [garden, setGarden] = useState<HabitGardenArea[]>([]);
  const [filter, setFilter] = useState('all');
  const [quickTitle, setQuickTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { busy, error, run } = useAction();
  const reload = useCallback(async () => {
    const [rows, goals, areas] = await Promise.all([
      repos.habits.summary(date),
      repos.goals.list(),
      repos.lifeAreas.list(),
    ]);
    setRows(rows);
    setGoals(goals);
    setAreas(areas);
    const linkedArea = (row: Row) =>
      row.habit.areaId ?? goals.find((goal) => goal.id === row.habit.goalId)?.areaId ?? 'none';
    const groups = [
      ...areas.map((area) => ({ id: area.id, name: area.name })),
      { id: 'none', name: '' },
    ];
    setGarden(
      groups
        .map((area) => {
          const members = rows.filter((row) => linkedArea(row) === area.id);
          return {
            id: area.id,
            name: area.name,
            progress: habitDashboard(members, date).weekly,
            count: members.length,
          };
        })
        .filter((area) => area.count > 0),
    );
    setLoading(false);
    setLoadError(false);
  }, [repos, date]);
  useEffect(() => {
    void reload().catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [reload]);
  const action = (fn: () => Promise<void>) =>
    run(async () => {
      await commit(fn);
      await reload();
    });
  const linkedArea = (row: Row) =>
    row.habit.areaId ?? goals.find((goal) => goal.id === row.habit.goalId)?.areaId ?? 'none';
  const visible = rows.filter((row) => filter === 'all' || linkedArea(row) === filter);
  const stats = habitDashboard(rows, date);
  const selectArea = (id: string) => {
    setFilter(id);
    document.getElementById('habit-today-list')?.scrollIntoView({ block: 'nearest' });
  };
  const displayGarden = garden.map((area) => ({ ...area, name: area.name || t('goals.noArea') }));
  return (
    <div className="habits-studio">
      <div className="habit-main">
        <header className="studio-heading">
          <div>
            <h1>{t('habitStudio.title')}</h1>
            <p>{t('habitStudio.subtitle')}</p>
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus size={16} />
            {t('habits.new')}
          </Button>
        </header>
        <HabitStats rows={rows} date={date} />
        <div className="studio-filters">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {t('goalStudio.statuses.all')}
          </button>
          {displayGarden.map((area) => (
            <button
              type="button"
              key={area.id}
              aria-pressed={filter === area.id}
              onClick={() => setFilter(area.id)}
            >
              {area.name}
            </button>
          ))}
        </div>
        <HabitGardenScene areas={displayGarden} onSelect={selectArea} />
        {(error || loadError) && (
          <p role="alert">
            {t('common.error')}
            <Button onClick={() => void reload().catch(() => setLoadError(true))}>
              {t('common.retry')}
            </Button>
          </p>
        )}
        {loading && <p role="status">{t('common.loading')}</p>}
        <div className="habit-workspace">
          <section className="studio-panel habit-today-list" id="habit-today-list">
            <header>
              <h2>
                <Leaf size={17} />
                {t('habitStudio.habitsDate')}
              </h2>
              <span>
                {stats.today.done}/{stats.today.due}
              </span>
            </header>
            <label className="habit-date-label">
              {t('habits.logDate')}
              <Input
                type="date"
                max={dayKey()}
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </label>
            <div className="habit-grid">
              {visible.map((row) => (
                <HabitCard
                  key={row.habit.id}
                  row={row}
                  date={date}
                  onSave={async (value) => {
                    await commit(() => repos.habits.log(row.habit.id, date, value));
                    await reload();
                  }}
                >
                  <div className="habit-edit-actions">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row.habit)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void action(() => repos.habits.setActive(row.habit.id, !row.habit.active))
                      }
                    >
                      {t(row.habit.active ? 'focus.pause' : 'focus.resume')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void action(() => repos.habits.remove(row.habit.id))}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </HabitCard>
              ))}
            </div>
            {!visible.length && !loading && <p>{t('habits.empty')}</p>}
          </section>
          <HabitHistory rows={visible} date={date} onDate={setDate} />
        </div>
        <form
          className="habit-quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!quickTitle.trim()) return;
            void run(async () => {
              await commit(() =>
                repos.habits.save({
                  title: quickTitle.trim(),
                  tracking: 'boolean',
                  targetValue: 1,
                  frequency: 'daily',
                  daysOfWeek: null,
                  areaId: filter === 'all' || filter === 'none' ? null : filter,
                }),
              );
              setQuickTitle('');
              await reload();
            });
          }}
        >
          <Plus size={20} />
          <Input
            aria-label={t('habitStudio.quick')}
            placeholder={t('habitStudio.quick')}
            value={quickTitle}
            required
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          <Button type="submit" disabled={busy || !quickTitle.trim()} aria-label={t('habits.new')}>
            <ArrowRight size={18} />
          </Button>
        </form>
      </div>
      <aside className="habit-side">
        <div className="inspiration-quote">
          <p>{t('habitStudio.quote')}</p>
        </div>
        <section className="studio-panel">
          <header>
            <h2>
              <Leaf size={17} />
              {t('habitStudio.guide')}
            </h2>
          </header>
          <p>{t('habitStudio.guideText', { count: stats.today.due - stats.today.done })}</p>
          <Button
            variant="outline"
            onClick={() => {
              setDate(dayKey());
              setFilter('all');
              document.getElementById('habit-today-list')?.scrollIntoView({ block: 'nearest' });
            }}
          >
            {t('habitStudio.seeToday')}
          </Button>
        </section>
        <section className="studio-panel habit-routines">
          <header>
            <h2>
              <Play size={17} />
              {t('habitStudio.routines')}
            </h2>
          </header>
          {displayGarden.map((area) => (
            <button type="button" key={area.id} onClick={() => selectArea(area.id)}>
              <span>
                <strong>{area.name}</strong>
                <small>{t('habitStudio.count', { count: area.count })}</small>
              </span>
              <Play size={18} />
            </button>
          ))}
          {!garden.length && <p>{t('habits.empty')}</p>}
        </section>
        <section className="studio-panel habit-side-stats">
          <h2>
            <Flame size={17} />
            {t('habitStudio.statistics')}
          </h2>
          <ProgressRing value={stats.weekly} label={t('habitStudio.weekly')} />
          <p>{t('habitStudio.weekly')}</p>
          <div>
            <span>
              <Flame size={16} />
              {stats.best} {t('habitStudio.days')}
            </span>
            <span>
              <Clock size={16} />
              {Math.round((stats.minutes / 60) * 10) / 10} h
            </span>
          </div>
          <small>{t('habitStudio.durationOnly')}</small>
        </section>
        <section className="studio-panel habit-library">
          <header>
            <h2>{t('habitStudio.library')}</h2>
          </header>
          <p>{t('habitStudio.libraryHint')}</p>
          {['reading', 'movement', 'learning', 'reflection'].map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                setQuickTitle(t(`habitStudio.templates.${key}`));
                document.querySelector<HTMLInputElement>('.habit-quick-add input')?.focus();
              }}
            >
              <Leaf size={15} />
              {t(`habitStudio.templates.${key}`)}
            </button>
          ))}
          <Link to="/sunnah">
            {t('sunnah.title')}
            <ArrowRight size={14} />
          </Link>
        </section>
      </aside>
      {editing !== undefined && (
        <HabitForm
          habit={editing}
          goals={goals}
          areas={areas}
          onClose={() => setEditing(undefined)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
