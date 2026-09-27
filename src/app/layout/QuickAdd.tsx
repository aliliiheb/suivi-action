import { useEffect, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { GoalWithArea } from '@/db/repositories/goals';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { TaskCapture } from '@/features/execution/TaskCapture';

export function QuickAdd({
  children,
  className = 'topbar-add',
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { repos, commit, progress } = useDb();
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<GoalWithArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setLoading(true);
      setFailed(false);
      void repos.goals
        .list()
        .then(setGoals)
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }
  }, [repos, open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Plus size={16} />
        {children ?? t('common.add')}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('inbox.title')} className="max-w-xl">
          {failed ? (
            <p role="alert">{t('common.error')}</p>
          ) : (
            <TaskCapture
              goals={goals}
              loading={loading}
              onAdd={async (values) => {
                await commit(async () => {
                  await repos.tasks.create({
                    ...values,
                    status:
                      values.plannedDate !== null ? 'planned' : values.goalId ? 'to_plan' : 'inbox',
                  });
                  if (values.goalId) await progress.recomputeGoal(values.goalId);
                });
                window.dispatchEvent(new Event('progress-data-changed'));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
