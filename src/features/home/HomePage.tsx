import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Target,
  CalendarCheck,
  BookOpen,
  Play,
  Leaf,
  Flame,
  GraduationCap,
  Dumbbell,
  Sparkles,
  ChevronRight,
  CircleCheck,
} from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { TaskWithContext } from '@/db/repositories/tasks';
import type { HabitRepository } from '@/db/repositories/habits';
import { startOfDayMs, endOfDayMs, dayKey } from '@/shared/lib/time';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { Button } from '@/shared/ui/components/Button';
import { AdhkarHomeCards, VerseOfDay } from '@/features/spiritual/SpiritualCards';
import { QuickAdd } from '@/app/layout/QuickAdd';

type HabitSummary = Awaited<ReturnType<HabitRepository['summary']>>;
const orbitPositions = [
  [50, 5],
  [79, 22],
  [80, 47],
  [78, 73],
  [50, 88],
  [22, 73],
  [20, 47],
  [21, 22],
];
const goalIcons = { quran: BookOpen, sport: Dumbbell, study: GraduationCap };

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { repos, commit, progress } = useDb();
  const [goals, setGoals] = useState<GoalWithArea[]>([]);
  const [tasks, setTasks] = useState<TaskWithContext[]>([]);
  const [habits, setHabits] = useState<HabitSummary>([]);
  const [done, setDone] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(dayKey());
  const [orbitPage, setOrbitPage] = useState(0);
  const reload = useCallback(async () => {
    try {
      const [g, tasksToday, completed, h, priorities] = await Promise.all([
        repos.goals.list(),
        repos.tasks.listPlannedActiveBetween(startOfDayMs(), endOfDayMs()),
        repos.tasks.listCompletedBetween(startOfDayMs(), endOfDayMs()),
        repos.habits.summary(),
        repos.planning.listPriorities(),
      ]);
      setGoals(g.filter((goal) => !['done', 'abandoned', 'archived'].includes(goal.status)));
      setTasks(
        [...tasksToday].sort(
          (a, b) => Number(priorities.includes(b.id)) - Number(priorities.includes(a.id)),
        ),
      );
      setDone(completed.length);
      setHabits(h.filter((row) => row.habit.active));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [repos]);
  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener('progress-data-changed', handler);
    return () => window.removeEventListener('progress-data-changed', handler);
  }, [reload, today]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(dayKey()), 30000);
    return () => clearInterval(timer);
  }, []);
  const complete = async (task: TaskWithContext) => {
    if (busy) return;
    setBusy(true);
    try {
      await commit(async () => {
        await repos.tasks.setCompleted(task.id, true);
        if (task.goalId) await progress.recomputeGoal(task.goalId);
      });
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const priority = [...goals].sort(
    (a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity),
  )[0];
  const total = tasks.length + done;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const streak = Math.max(0, ...habits.map((row) => row.stats.current));
  const maxPage = Math.max(1, Math.ceil(goals.length / 8));
  const orbitGoals = goals.slice((orbitPage % maxPage) * 8, (orbitPage % maxPage) * 8 + 8);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - 6 + i);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString(i18n.language, { weekday: 'narrow' }),
    };
  });
  return (
    <div className="sanctuary-home">
      {error && (
        <p role="alert">
          {t('common.error')} <Button onClick={() => void reload()}>{t('common.retry')}</Button>
        </p>
      )}
      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          <div className="sanctuary-upper">
            <div className="sanctuary-primary">
              <div className="sanctuary-welcome">
                <div>
                  <h1>
                    {t(
                      new Date().getHours() < 18
                        ? 'today.greetingMorning'
                        : 'today.greetingEvening',
                    )}{' '}
                    <span>✦</span>
                  </h1>
                  <p>{t('command.welcome')}</p>
                </div>
                <VerseOfDay compact />
              </div>
              <div className="sanctuary-stats">
                {[
                  { label: t('home.activeGoals'), value: goals.length, icon: Target, to: '/goals' },
                  { label: t('home.tasksToday'), value: total, icon: CalendarCheck, to: '/today' },
                  {
                    label: t('home.completion'),
                    value: `${percent}%`,
                    icon: CircleCheck,
                    to: '/analytics',
                  },
                  { label: t('command.streak'), value: streak, icon: Flame, to: '/habits' },
                ].map(({ label, value, icon: Icon, to }, index) => (
                  <Link key={to} to={to} className={`sanctuary-stat stat-${index}`}>
                    <span className="stat-medallion">
                      <Icon size={25} />
                    </span>
                    <div>
                      <strong>{value}</strong>
                      <small>{label}</small>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="sanctuary-center">
                <div className="sanctuary-priorities">
                  <section className="glass-panel priority-card">
                    <span className="small-heading">
                      <Target size={14} />
                      {t('home.priority')}
                    </span>
                    <h2>{priority?.title ?? t('home.startGoal')}</h2>
                    {priority && (
                      <>
                        <div className="priority-progress">
                          <ProgressBar value={priority.progress} />
                          <strong>{Math.round(priority.progress)}%</strong>
                        </div>
                        <p className="priority-context">
                          {priority.areaName}
                          <br />
                          {priority.deadline
                            ? new Date(priority.deadline).toLocaleDateString(i18n.language)
                            : t('command.atYourPace')}
                        </p>
                      </>
                    )}
                    <Link className="gold-link" to={priority ? `/goals/${priority.id}` : '/goals'}>
                      {t(priority ? 'home.continue' : 'home.createGoal')}
                      <ArrowRight size={14} />
                    </Link>
                  </section>
                  <section className="glass-panel next-card">
                    <div className="small-heading">
                      <CalendarCheck size={14} />
                      <h2>{t('home.nextTasks')}</h2>
                      <Link to="/today">{t('home.viewAll')}</Link>
                    </div>
                    <div className="next-task-list">
                      {tasks.slice(0, 3).map((task, index) => (
                        <div className="next-task" key={task.id}>
                          <Link
                            className="task-play"
                            to={`/focus?task=${task.id}`}
                            aria-label={`${t('focus.title')} ${task.title}`}
                          >
                            {index === 0 ? <Play size={15} /> : String(index + 1).padStart(2, '0')}
                          </Link>
                          <Link className="next-task-title" to={`/focus?task=${task.id}`}>
                            <strong>{task.title}</strong>
                            <small>
                              {task.estimatedMin
                                ? `${task.estimatedMin} min`
                                : task.goalTitle || t('home.independent')}
                            </small>
                          </Link>
                          <button
                            aria-label={`${t('command.complete')} ${task.title}`}
                            className="task-check"
                            disabled={busy}
                            onClick={() => void complete(task)}
                          />
                        </div>
                      ))}
                    </div>
                    {!tasks.length && <p className="compact-empty">{t('home.noTasks')}</p>}
                    <Link
                      className="focus-link"
                      to={tasks[0] ? `/focus?task=${tasks[0].id}` : '/focus'}
                    >
                      <Play size={12} />
                      {t('command.focusMode')}
                    </Link>
                  </section>
                </div>
                <section className="sphere-stage" aria-label={t('command.goalSphere')}>
                  <img
                    className="sphere-render"
                    src="/art/life-sphere.png"
                    alt=""
                    width="1000"
                    height="1000"
                  />
                  <div className="sphere-caption">
                    <strong>{t('home.life')}</strong>
                    <span>{t('command.balance')}</span>
                  </div>
                  <div className="objective-orbit">
                    {orbitGoals.map((goal, index) => {
                      const Icon = goalIcons[goal.goalType as keyof typeof goalIcons] ?? Target;
                      const position = orbitPositions[Math.floor((index * 8) / orbitGoals.length)]!;
                      return (
                        <Link
                          key={goal.id}
                          className={`orbit-objective orbit-color-${index % 4}`}
                          style={
                            { '--x': `${position[0]}%`, '--y': `${position[1]}%` } as CSSProperties
                          }
                          to={`/goals/${goal.id}`}
                          title={goal.title}
                        >
                          <span>
                            <Icon size={17} />
                          </span>
                          <div>
                            <strong>{goal.title}</strong>
                            <small>{Math.round(goal.progress)}%</small>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  {!goals.length && (
                    <Link className="sphere-empty" to="/goals">
                      {t('home.createGoal')}
                      <ArrowRight size={13} />
                    </Link>
                  )}
                  {goals.length > 8 && (
                    <button
                      className="orbit-next"
                      onClick={() => setOrbitPage((page) => (page + 1) % maxPage)}
                    >
                      {t('command.moreGoals')}
                      <ChevronRight size={14} />
                    </button>
                  )}
                </section>
              </div>
            </div>
            <AdhkarHomeCards />
          </div>
          <div className="sanctuary-bottom">
            <section className="glass-panel day-mini">
              <div className="small-heading">
                <CalendarCheck size={14} />
                <h2>{t('today.title')}</h2>
                <Link to="/today">{t('home.viewAll')}</Link>
              </div>
              {tasks.slice(0, 5).map((task, index) => (
                <Link className="timeline-task" key={task.id} to={`/focus?task=${task.id}`}>
                  <i />
                  <small>{task.estimatedMin ? `${task.estimatedMin}m` : `0${index + 1}`}</small>
                  <span>{task.title}</span>
                </Link>
              ))}
              {!tasks.length && <p className="compact-empty">{t('home.noTasks')}</p>}
            </section>
            <section className="glass-panel goals-mini">
              <div className="small-heading">
                <Target size={14} />
                <h2>{t('nav.goals')}</h2>
                <Link to="/goals">{t('home.viewAll')}</Link>
              </div>
              {goals.slice(0, 4).map((goal) => (
                <Link className="mini-goal" key={goal.id} to={`/goals/${goal.id}`}>
                  <span>{goal.title}</span>
                  <strong>{Math.round(goal.progress)}%</strong>
                  <ProgressBar value={goal.progress} />
                </Link>
              ))}
              {!goals.length && <p className="compact-empty">{t('home.startGoal')}</p>}
            </section>
            <section className="glass-panel habits-mini">
              <div className="small-heading">
                <Leaf size={14} />
                <h2>{t('habits.title')}</h2>
                <Link to="/habits">{t('command.sevenDays')}</Link>
              </div>
              <div className="habit-week-head">
                <span />
                {week.map((day) => (
                  <small key={day.key}>{day.label}</small>
                ))}
              </div>
              {habits.slice(0, 4).map(({ habit, logs }) => (
                <Link className="habit-week-row" key={habit.id} to="/habits">
                  <span>{habit.title}</span>
                  {week.map((day) => {
                    const completed =
                      (logs.find((log) => log.date === day.key)?.value ?? 0) >=
                      (habit.tracking === 'boolean' ? 1 : (habit.targetValue ?? 1));
                    return (
                      <i
                        className={completed ? 'done' : ''}
                        key={day.key}
                        title={`${day.key} · ${completed ? t('command.done') : t('command.notDone')}`}
                      />
                    );
                  })}
                </Link>
              ))}
              {!habits.length && (
                <Link className="compact-empty" to="/habits">
                  {t('home.habitText')}
                </Link>
              )}
            </section>
            <Link className="glass-panel advice-mini" to="/learn/recommendations">
              <div className="small-heading">
                <Sparkles size={16} />
                <h2>{t('home.recommendations')}</h2>
              </div>
              <p>{t('command.learningAdvice')}</p>
              <span className="suggestion-tag">{t('learn.local')}</span>
              <span className="sacred-action">
                {t('home.explore')}
                <ArrowRight size={12} />
              </span>
            </Link>
            <Link className="inspiration-mini" to="/quran">
              <BookOpen size={18} />
              <span>{t('command.quietMoment')}</span>
            </Link>
          </div>
          <QuickAdd className="sanctuary-capture">
            {t('home.capture')}
            <ArrowRight size={16} />
          </QuickAdd>
        </>
      )}
    </div>
  );
}
