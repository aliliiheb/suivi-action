import { useWords } from '@/features/workspaces/useWords';
import { PlannerBoard } from './PlannerBoard';
import { useCallback, useEffect, useState } from 'react';
import {
  addYears,
  startOfYear,
  endOfYear,
  addDays,
  addMonths,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  eachDayOfInterval,
  endOfWeek,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { TaskWithContext } from '@/db/repositories/tasks';
import type { Habit } from '@/db/repositories/habits';
import { isHabitDay } from '@/domain/habits/statistics';
import { dayKey, startOfDayMs, endOfDayMs } from '@/shared/lib/time';
import { useAction } from '@/shared/lib/useAction';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { OperationalTaskRow } from '@/features/execution/OperationalTask';
import { TaskEditButton } from '@/features/execution/TaskEditor';

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const w = useWords();
  const { repos, commit, progress } = useDb();
  const [date, setDate] = useState(dayKey());
  const [view, setView] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [tasks, setTasks] = useState<TaskWithContext[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [focus, setFocus] = useState<Awaited<ReturnType<typeof repos.focus.history>>>([]);
  const { busy, error, run } = useAction();
  const [loadError, setLoadError] = useState(false);
  const chosen = new Date(`${date}T12:00:00`);
  const start =
    view === 'year'
      ? startOfYear(chosen)
      : view === 'month'
        ? startOfWeek(startOfMonth(chosen), { weekStartsOn: 1 })
        : view === 'week'
          ? startOfWeek(chosen, { weekStartsOn: 1 })
          : chosen;
  const end =
    view === 'year'
      ? endOfYear(chosen)
      : view === 'month'
        ? endOfWeek(endOfMonth(chosen), { weekStartsOn: 1 })
        : view === 'week'
          ? addDays(start, 6)
          : chosen;
  const startMs = startOfDayMs(start),
    endMs = endOfDayMs(end);
  const days = eachDayOfInterval({ start, end });
  const reload = useCallback(async () => {
    const [tasks, habits, focus] = await Promise.all([
      repos.tasks.listCalendar(startMs, endMs),
      repos.habits.list(),
      repos.focus.history(),
    ]);
    setTasks(tasks);
    setHabits(habits);
    setFocus(focus);
  }, [repos, startMs, endMs]);
  useEffect(() => {
    void reload()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true));
  }, [reload]);
  const forDay = (date: string) =>
    tasks.filter(
      (task) =>
        (task.plannedDate !== null && dayKey(task.plannedDate) === date) ||
        (task.deadline !== null && dayKey(task.deadline) === date),
    );
  const selectedTasks = forDay(date);
  const move = (direction: number) =>
    setDate(
      dayKey(
        view === 'year'
          ? addYears(chosen, direction)
          : view === 'month'
            ? addMonths(chosen, direction)
            : addDays(chosen, direction * (view === 'week' ? 7 : 1)),
      ),
    );
  return (
    <div className="page-stack atelier-page planning-atelier">
      <div className="page-header">
        <div className="atelier-title">
          <div>
            <h1>{w('Mon Planning', 'My Planning', 'تخطيطي')}</h1>
            <p>
              {w(
                'Donne une place dans ton temps à ce qui compte vraiment.',
                'Make time for what truly matters.',
                'امنح وقتك لما يهم حقاً.',
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {(['day', 'week', 'month', 'year'] as const).map((mode) => (
            <Button
              key={mode}
              variant={view === mode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView(mode)}
            >
              {mode === 'year' ? w('Année', 'Year', 'سنة') : t(`calendar.${mode}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="filter-bar">
        <Button variant="outline" size="sm" onClick={() => move(-1)}>
          {t('calendar.previous')}
        </Button>
        <Input
          type="date"
          className="w-44"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <Button variant="outline" size="sm" onClick={() => move(1)}>
          {t('calendar.next')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(dayKey())}>
          {t('today.title')}
        </Button>
      </div>
      {view === 'year' && (
        <div className="planner-year">
          {Array.from({ length: 12 }, (_, month) => {
            const d = new Date(chosen.getFullYear(), month, 1);
            return (
              <button
                key={month}
                onClick={() => {
                  setDate(dayKey(d));
                  setView('month');
                }}
              >
                <strong>{d.toLocaleDateString(i18n.language, { month: 'long' })}</strong>
                <small>
                  {
                    tasks.filter((task) => {
                      const ts = task.plannedDate ?? task.deadline;
                      return ts !== null && new Date(ts).getMonth() === month;
                    }).length
                  }{' '}
                  {w('tâches', 'tasks', 'مهام')}
                </small>
                <div>
                  {Array.from({ length: endOfMonth(d).getDate() }, (_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <PlannerBoard days={days} date={date} tasks={tasks} onDate={setDate} view={view} />
      <div className={view === 'month' ? 'calendar-layout' : undefined}>
        {view === 'month' ? (
          <div className="calendar-grid grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day);
              const items = forDay(key);
              const dueHabits = habits.filter((habit) => habit.active && isHabitDay(habit, key));
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDate(key)}
                  aria-pressed={date === key}
                  className={`calendar-cell overflow-hidden text-start ${date === key ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                >
                  <span className="text-xs text-fg-muted">
                    {day.toLocaleDateString(i18n.language, { weekday: 'short' })}
                  </span>
                  <strong className="ms-1 text-sm">{day.getDate()}</strong>
                  {items.slice(0, 2).map((task) => (
                    <span
                      key={task.id}
                      className={`mt-1 block truncate text-xs ${task.completed ? 'text-fg-muted line-through' : 'text-primary'}`}
                    >
                      {task.title}
                    </span>
                  ))}
                  {items.length > 2 ? (
                    <span className="block text-xs text-fg-muted">+{items.length - 2}</span>
                  ) : null}
                  {dueHabits.length ? (
                    <span className="mt-1 block text-xs text-fg-muted">
                      {t('calendar.habitCount', { count: dueHabits.length })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {error || loadError ? (
          <p role="alert" className="text-danger">
            {t('common.error')}
          </p>
        ) : null}
        <section className="calendar-details surface space-y-3">
          <h2 className="font-semibold">
            {chosen.toLocaleDateString(i18n.language, { dateStyle: 'full' })}
          </h2>
          {selectedTasks.map((task) => (
            <div key={task.id}>
              <OperationalTaskRow
                task={task}
                onToggle={() =>
                  void run(async () => {
                    await commit(async () => {
                      await repos.tasks.setCompleted(task.id, !task.completed);
                      if (task.goalId) await progress.recomputeGoal(task.goalId);
                    });
                    await reload();
                  })
                }
              >
                <TaskEditButton task={task} onSaved={reload} />
              </OperationalTaskRow>
              {task.deadline !== null && dayKey(task.deadline) === date ? (
                <p className="mt-1 text-xs text-danger">{t('goals.deadlineLabel')}</p>
              ) : null}
            </div>
          ))}
          {!selectedTasks.length ? (
            <p className="text-sm text-fg-muted">{t('calendar.empty')}</p>
          ) : null}
          {habits
            .filter((habit) => habit.active && isHabitDay(habit, date))
            .map((habit) => (
              <p key={habit.id} className="text-sm text-fg-muted">
                {t('habits.title')} · {habit.title}
              </p>
            ))}
          {focus
            .filter((session) => session.date === date && session.endedAt !== null)
            .map((session) => (
              <p key={session.id} className="text-sm text-fg-muted">
                {t('focus.title')} · {session.taskTitle} · {Math.round(session.durationMin)}{' '}
                {t('common.minShort')}
              </p>
            ))}
          {busy ? (
            <p role="status" className="text-sm">
              {t('common.saving')}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
