import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { FocusSession } from '@/db/repositories/focus';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { advanceTimer, timerText } from '@/domain/focus/timer';
import { dayKey } from '@/shared/lib/time';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { TaskContextLine } from '@/features/execution/OperationalTask';

export function FocusPage() {
  const { t, i18n } = useTranslation();
  const { repos, commit } = useDb();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(params.get('task') ?? '');
  const [tasks, setTasks] = useState<TaskWithContext[]>([]);
  const [session, setSession] = useState<FocusSession>();
  const [context, setContext] = useState<TaskWithContext>();
  const [history, setHistory] = useState<(FocusSession & { taskTitle: string | null })[]>([]);
  const [target, setTarget] = useState('25');
  const [pomodoro, setPomodoro] = useState(false);
  const [breakMin, setBreakMin] = useState('5');
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [manualMin, setManualMin] = useState('30');
  const [manualDate, setManualDate] = useState(dayKey());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    const [active, choices, history] = await Promise.all([
      repos.focus.active(),
      repos.tasks.listActive(),
      repos.focus.history(),
    ]);
    setSession(active);
    setTasks(choices);
    setHistory(history);
    setContext(active?.taskId ? await repos.tasks.getWithContext(active.taskId) : undefined);
  }, [repos]);
  useEffect(() => {
    void reload().catch((err) => {
      console.error(err);
      setError(true);
    });
  }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void repos.focus.active().then(setSession).catch(console.error);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [repos]);
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
  const elapsed = session ? advanceTimer(session, now).elapsedMs : 0;
  const shownElapsed =
    session?.targetMin != null ? Math.min(elapsed, session.targetMin * 60000) : elapsed;
  const reachedTarget = session?.targetMin != null && shownElapsed >= session.targetMin * 60000;
  const selectedTask = tasks.find((task) => task.id === selected);
  const historyRows = history.filter((item) => item.endedAt !== null);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-semibold">{t('focus.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('focus.subtitle')}</p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-danger">
          {t('common.error')}
        </p>
      ) : null}
      <div className="focus-layout">
        <div className="space-y-6 min-w-0">
          <section className="focus-console surface space-y-5">
            {session ? (
              <>
                <h2 className="text-lg font-medium">{context?.title ?? t('focus.title')}</h2>
                {context ? <TaskContextLine task={context} /> : null}
                {session.recovered ? (
                  <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">
                    {t('focus.recovered')}
                  </p>
                ) : null}
                <p className="focus-clock text-center font-mono tabular-nums" dir="ltr">
                  {timerText(shownElapsed)}
                </p>
                <p className="text-center text-sm text-fg-muted">
                  {t(
                    reachedTarget
                      ? 'focus.targetReached'
                      : session.state === 'running'
                        ? 'focus.running'
                        : 'focus.paused',
                  )}
                </p>
                {context?.estimatedMin ? (
                  <p className="text-center text-sm text-fg-muted">
                    {t('focus.estimate', { minutes: context.estimatedMin })}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void act(() => repos.focus.setPaused(session.state === 'running'))
                    }
                  >
                    {t(session.state === 'running' ? 'focus.pause' : 'focus.resume')}
                  </Button>
                  <Button disabled={busy} onClick={() => void act(() => repos.focus.stop(comment))}>
                    {t('focus.stop')}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void act(() => repos.focus.stop(comment, true))}
                  >
                    {t('focus.complete')}
                  </Button>
                </div>
                {reachedTarget ? (
                  <div className="flex items-center justify-center gap-2">
                    <label className="text-sm">
                      {t('focus.breakMin')}
                      <Input
                        type="number"
                        className="w-24"
                        min="1"
                        max="60"
                        value={breakMin}
                        onChange={(e) => setBreakMin(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="outline"
                      disabled={
                        !Number.isFinite(Number(breakMin)) ||
                        Number(breakMin) < 1 ||
                        Number(breakMin) > 60
                      }
                      onClick={() => setBreakEnd(Date.now() + Number(breakMin) * 60000)}
                    >
                      {t('focus.startBreak')}
                    </Button>
                    {breakEnd ? (
                      <span dir="ltr">{timerText(Math.max(0, breakEnd - now))}</span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <label className="block text-sm">
                  {t('focus.chooseTask')}
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">{t('today.chooseTask')}</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                        {task.goalTitle ? ` · ${task.goalTitle}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedTask ? <TaskContextLine task={selectedTask} /> : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pomodoro}
                    onChange={(e) => setPomodoro(e.target.checked)}
                  />
                  {t('focus.pomodoro')}
                </label>
                {pomodoro ? (
                  <label className="block text-sm">
                    {t('focus.target')}
                    <Input
                      type="number"
                      className="mt-1 w-28"
                      min="1"
                      max="240"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    />
                  </label>
                ) : null}
                <Button
                  disabled={
                    busy ||
                    !selected ||
                    (pomodoro &&
                      (!Number.isInteger(Number(target)) ||
                        Number(target) < 1 ||
                        Number(target) > 240))
                  }
                  onClick={() =>
                    void act(() => repos.focus.start(selected, pomodoro ? Number(target) : null))
                  }
                >
                  {t('focus.start')}
                </Button>
              </>
            )}
            <label className="block text-sm">
              {t('focus.comment')}
              <Input
                className="mt-2"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          </section>
          {!session ? (
            <form
              className="focus-manual surface flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() =>
                  repos.focus.addManual(selected, Number(manualMin), manualDate, comment),
                );
              }}
            >
              <label className="text-sm">
                {t('focus.manual')}
                <Input
                  className="mt-1 w-28"
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                />
              </label>
              <label className="text-sm">
                {t('tasks.plannedDate')}
                <Input
                  className="mt-1 w-44"
                  type="date"
                  required
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </label>
              <Button type="submit" variant="outline" disabled={busy || !selected}>
                {t('common.add')}
              </Button>
            </form>
          ) : null}
        </div>
        <section className="focus-history space-y-3">
          <h2 className="section-heading">{t('focus.history')}</h2>
          {historyRows.length ? (
            <ul className="space-y-2">
              {historyRows.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
                >
                  <div>
                    <p>{item.taskTitle ?? t('focus.deletedTask')}</p>
                    <p className="text-xs text-fg-muted">{item.comment}</p>
                  </div>
                  <div className="text-end">
                    <p>
                      {new Date(item.startedAt).toLocaleDateString(i18n.language)} ·{' '}
                      {Number(item.durationMin.toFixed(1))} {t('common.minShort')}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {t(
                        item.entryType === 'manual' ? 'focus.manualEntry' : 'focus.automaticEntry',
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('focus.empty')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
