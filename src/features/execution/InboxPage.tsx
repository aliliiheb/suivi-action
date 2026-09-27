import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox as InboxIcon, CalendarPlus, Trash2 } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { TaskWithContext } from '@/db/repositories/tasks';
import type { GoalWithArea } from '@/db/repositories/goals';
import { EmptyState } from '@/shared/ui/components/EmptyState';
import { Button } from '@/shared/ui/components/Button';
import { TaskCapture, type TaskCaptureValues } from './TaskCapture';
import { OperationalTaskRow } from './OperationalTask';
import { cn } from '@/shared/lib/cn';
import { TaskEditButton } from './TaskEditor';

const selectClass = cn(
  'h-8 rounded-md border border-border bg-surface px-2 text-xs text-fg',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export function InboxPage() {
  const { t } = useTranslation();
  const { repos, commit, progress } = useDb();
  const [items, setItems] = useState<TaskWithContext[]>([]);
  const [goals, setGoals] = useState<GoalWithArea[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [inbox, goalRows] = await Promise.all([repos.tasks.listInbox(), repos.goals.list()]);
    setItems(inbox);
    setGoals(goalRows);
    setLoading(false);
  }, [repos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (values: TaskCaptureValues) => {
    await commit(async () => {
      await repos.tasks.create({
        ...values,
        status: values.plannedDate !== null ? 'planned' : values.goalId ? 'to_plan' : 'inbox',
      });
      if (values.goalId) await progress.recomputeGoal(values.goalId);
    });
    // A refresh failure must not invite a second creation of an already saved task.
    await reload().catch((error) => console.error('Inbox refresh failed', error));
  };
  const complete = (task: TaskWithContext) =>
    commit(() => repos.tasks.setCompleted(task.id, !task.completed)).then(reload);
  const planToday = (task: TaskWithContext) =>
    commit(() => repos.tasks.planForToday(task.id)).then(reload);
  const remove = (task: TaskWithContext) =>
    commit(() => repos.tasks.softDelete(task.id)).then(reload);
  const assign = (task: TaskWithContext, goalId: string) =>
    commit(async () => {
      await repos.tasks.update(task.id, { goalId, status: 'to_plan' });
      await progress.recomputeGoal(goalId);
    }).then(reload);

  return (
    <div className="inbox-page page-stack">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-semibold text-fg">{t('inbox.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('inbox.subtitle')}</p>
        </div>
      </div>

      <div className="capture-wrap">
        <TaskCapture goals={goals} loading={loading} onAdd={add} />
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-fg-muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-8 w-8" />}
          title={t('inbox.emptyTitle')}
          description={t('inbox.emptyDescription')}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((task) => (
            <li key={task.id}>
              <OperationalTaskRow task={task} onToggle={() => void complete(task)}>
                <TaskEditButton task={task} onSaved={reload} />
                <select
                  className={selectClass}
                  value=""
                  aria-label={t('inbox.assign')}
                  onChange={(e) => e.target.value && void assign(task, e.target.value)}
                >
                  <option value="">{t('inbox.assign')}</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('inbox.planToday')}
                  title={t('inbox.planToday')}
                  onClick={() => void planToday(task)}
                >
                  <CalendarPlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.delete')}
                  onClick={() => void remove(task)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </OperationalTaskRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
