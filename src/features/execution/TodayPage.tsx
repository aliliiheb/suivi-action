import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  Star,
  Trash2,
  Target,
  Play,
  Sun,
  Moon,
  Clock,
  List,
  Route,
  CheckCircle2,
} from 'lucide-react';
import { ScenicPath } from '@/features/journey/ScenicPath';
import { InspirationRail } from '@/features/journey/InspirationRail';
import { QuickInbox } from '@/features/journey/QuickInbox';
import { goalIcon } from '@/features/goals/goalPresentation';
import { useDb } from '@/app/providers/databaseContext';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { EmptyState } from '@/shared/ui/components/EmptyState';
import { ProgressRing } from '@/shared/ui/components/ProgressRing';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { startOfDayMs, endOfDayMs, addDaysMs, dayKey } from '@/shared/lib/time';
import { summarizeDay } from '@/domain/planning/daySummary';
import { OperationalTaskRow } from './OperationalTask';
import { TaskEditButton } from './TaskEditor';
import { HabitsToday } from '@/features/habits/HabitsPage';
import { Link, useNavigate } from 'react-router-dom';

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { repos, commit, progress } = useDb();
  const [overdue, setOverdue] = useState<TaskWithContext[]>([]);
  const [planned, setPlanned] = useState<TaskWithContext[]>([]);
  const [completed, setCompleted] = useState<TaskWithContext[]>([]);
  const [available, setAvailable] = useState<TaskWithContext[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [capacity, setCapacity] = useState(480);
  const [capacityInput, setCapacityInput] = useState('480');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [view, setView] = useState('timeline');
  const [focusMin, setFocusMin] = useState(0);
  const [today, setToday] = useState(dayKey());

  const reload = useCallback(async () => {
    const start = startOfDayMs();
    const end = endOfDayMs();
    const [od, pl, cp, active, top, cap, focus] = await Promise.all([
      repos.tasks.listOverdue(start),
      repos.tasks.listPlannedActiveBetween(start, end),
      repos.tasks.listCompletedBetween(start, end),
      repos.tasks.listActive(),
      repos.planning.listPriorities(),
      repos.planning.getCapacity(),
      repos.focus.durationForDay(dayKey()),
    ]);
    setFocusMin(focus);
    setOverdue(od);
    setPlanned(pl);
    setCompleted(cp);
    setPriorities(top);
    setCapacity(cap);
    setCapacityInput(String(cap));
    setAvailable(
      active.filter(
        (task) => task.plannedDate === null || task.plannedDate < start || task.plannedDate > end,
      ),
    );
    setLoading(false);
  }, [repos]);

  useEffect(() => {
    void reload().catch((err) => {
      console.error(err);
      setError(true);
      setLoading(false);
    });
  }, [reload, today]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(dayKey()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await commit(fn);
      await reload();
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (task: TaskWithContext) =>
    act(async () => {
      await repos.tasks.setCompleted(task.id, !task.completed);
      if (task.goalId) await progress.recomputeGoal(task.goalId);
    });
  const remove = (task: TaskWithContext) =>
    act(async () => {
      await repos.tasks.softDelete(task.id);
      if (task.goalId) await progress.recomputeGoal(task.goalId);
    });
  const summary = summarizeDay([...planned, ...completed], capacity);
  const milestones = useMemo(
    () =>
      [...completed, ...planned].map((task, index) => ({
        id: task.id,
        title: task.title,
        meta: task.estimatedMin ? task.estimatedMin + ' ' + t('common.minShort') : undefined,
        done: task.completed,
        current: !task.completed && index === completed.length,
        icon: goalIcon(task.goalType ?? 'custom'),
      })),
    [completed, planned, t],
  );
  const topTasks = [...planned, ...completed]
    .filter((task) => priorities.includes(task.id))
    .sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id));

  const hour = new Date().getHours();
  const greeting = t(
    hour < 12
      ? 'today.greetingMorning'
      : hour < 18
        ? 'today.greetingAfternoon'
        : 'today.greetingEvening',
  );

  const row = (task: TaskWithContext, late = false) => (
    <li key={task.id}>
      <OperationalTaskRow
        task={task}
        onToggle={() => {
          if (!busy) void toggle(task);
        }}
      >
        {late ? (
          <div className="flex flex-wrap gap-1">
            <Button
              disabled={busy}
              variant="outline"
              size="sm"
              onClick={() => void act(() => repos.tasks.setPlannedDate(task.id, startOfDayMs()))}
            >
              {t('today.moveToday')}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              size="sm"
              onClick={() => void act(() => repos.tasks.setPlannedDate(task.id, addDaysMs(1)))}
            >
              {t('today.moveTomorrow')}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(
              priorities.includes(task.id) ? 'today.removePriority' : 'today.addPriority',
            )}
            aria-pressed={priorities.includes(task.id)}
            disabled={
              busy ||
              (!priorities.includes(task.id) && priorities.length >= 3) ||
              task.plannedDate === null ||
              dayKey(task.plannedDate) !== today
            }
            onClick={() => void act(() => repos.planning.togglePriority(task.id))}
          >
            <Star
              className={`h-4 w-4 ${priorities.includes(task.id) ? 'fill-primary text-primary' : ''}`}
            />
          </Button>
        )}
        <TaskEditButton task={task} onSaved={reload} />
        {!task.completed ? (
          <Link className="rounded-md px-2 py-1 text-sm text-primary" to={`/focus?task=${task.id}`}>
            {t('focus.title')}
          </Link>
        ) : null}
        <Button
          disabled={busy}
          variant="ghost"
          size="icon"
          aria-label={t('common.delete')}
          onClick={() => void remove(task)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </OperationalTaskRow>
    </li>
  );
  const section = (title: string, tasks: TaskWithContext[], late = false) =>
    tasks.length ? (
      <section className="space-y-2">
        <h2 className={`section-heading ${late ? 'text-danger' : 'text-fg-muted'}`}>{title}</h2>
        <ul className="space-y-2">{tasks.map((task) => row(task, late))}</ul>
      </section>
    ) : null;

  return (
    <div className="daily-studio">
      <div className="daily-main">
        <section className="daily-hero">
          <div className="daily-hero-top">
            <div>
              <p className="studio-eyebrow">
                <CalendarCheck size={15} />
                {new Date().toLocaleDateString(i18n.language, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <h1>
                {greeting} <span aria-hidden="true">☀</span>
              </h1>
              <p>{t('dailyStudio.blessing')}</p>
            </div>
            <div className="daily-ring">
              <ProgressRing value={summary.progress} label={t('today.title')} />
              <div>
                <strong>{t('today.dayProgress', summary)}</strong>
                <span>
                  <Clock size={14} />
                  {focusMin} {t('common.minShort')} {t('focus.title')}
                </span>
              </div>
            </div>
          </div>
          {loading ? (
            <p role="status">{t('common.loading')}</p>
          ) : (
            <ScenicPath
              stops={milestones}
              onSelect={(id) => navigate(`/focus?task=${id}`)}
              empty={t('today.timelineEmpty')}
            />
          )}
        </section>
        {error && (
          <p role="alert">
            {t('common.error')}{' '}
            <Button onClick={() => void act(reload)}>{t('common.retry')}</Button>
          </p>
        )}
        <div className="daily-core">
          <section className="studio-panel daily-priorities">
            <header>
              <h2>
                <Target size={20} />
                {t('today.top3')}
              </h2>
              <small>{topTasks.length}/3</small>
            </header>
            {topTasks.length ? (
              <ol>
                {topTasks.map((task, index) => (
                  <li key={task.id} data-complete={task.completed}>
                    <span className="priority-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.goalTitle ?? t('tasks.noGoal')}</small>
                    </div>
                    <span className="priority-duration">
                      {task.estimatedMin ? `${task.estimatedMin} ${t('common.minShort')}` : '—'}
                    </span>
                    {task.completed ? (
                      <CheckCircle2 size={21} />
                    ) : (
                      <Link to={`/focus?task=${task.id}`} className="studio-gold-link">
                        <Play size={12} />
                        {t('dailyStudio.start')}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{t('today.top3Empty')}</p>
            )}
          </section>
          <section className="studio-panel daily-agenda" id="daily-agenda">
            <header>
              <h2>
                <CalendarCheck size={18} />
                {t('dailyStudio.myDay')}
              </h2>
              <div className="studio-switch">
                <button
                  type="button"
                  aria-pressed={view === 'timeline'}
                  onClick={() => setView('timeline')}
                  aria-label={t('dailyStudio.timeline')}
                >
                  <Route size={14} />
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  aria-label={t('dailyStudio.list')}
                >
                  <List size={14} />
                </button>
              </div>
            </header>
            <div className="daily-agenda-tasks" data-view={view}>
              <ul>{[...planned, ...completed].map((task) => row(task))}</ul>
              {!planned.length && !completed.length && <p>{t('today.emptyTitle')}</p>}
            </div>
            <label className="daily-plan-select">
              {t('today.planTask')}
              <select
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) void act(() => repos.tasks.planForToday(e.target.value));
                }}
              >
                <option value="">{t('today.chooseTask')}</option>
                {available.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
        <div className="daily-bottom">
          <HabitsToday />
          <QuickInbox onSaved={reload} />
          <section className="studio-panel daily-compass">
            <header>
              <h2>
                <Clock size={17} />
                {t('dailyStudio.remaining')}
              </h2>
            </header>
            <strong className="studio-large">
              {planned.reduce((sum, task) => sum + (task.estimatedMin ?? 0), 0)}{' '}
              <small>{t('common.minShort')}</small>
            </strong>
            <p>{t('dailyStudio.remainingTasks', { count: planned.length })}</p>
            {summary.unestimated > 0 && (
              <p>{t('today.unestimated', { count: summary.unestimated })}</p>
            )}
            {summary.overloaded && (
              <p role="status" className="text-danger">
                {t('today.overloaded')}
              </p>
            )}
            <details>
              <summary>{t('today.capacity')}</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => repos.planning.setCapacity(today, Number(capacityInput)));
                }}
              >
                <Input
                  aria-label={t('today.capacity')}
                  type="number"
                  min="0"
                  max="1440"
                  required
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || capacityInput === String(capacity)}
                >
                  {t('common.save')}
                </Button>
              </form>
            </details>
            <p>{t('dailyStudio.capacityHint')}</p>
          </section>
        </div>
        <div className="daily-overdue">{section(t('today.overdue'), overdue, true)}</div>
        {!loading && !overdue.length && !planned.length && !completed.length && (
          <EmptyState
            icon={<CalendarCheck size={25} />}
            title={t('today.emptyTitle')}
            description={t('today.emptyDescription')}
          />
        )}
      </div>
      <InspirationRail />
      <footer className="studio-day-footer">
        <Link
          className="studio-green-link"
          to={planned[0] ? `/focus?task=${planned[0].id}` : '/inbox'}
        >
          <Sun size={20} />
          {t('dailyStudio.begin')}
        </Link>
        <p>{t('dailyStudio.discipline')}</p>
        <Link className="studio-outline-link" to="/reviews">
          <Moon size={18} />
          {t('dailyStudio.end')}
        </Link>
      </footer>
    </div>
  );
}
