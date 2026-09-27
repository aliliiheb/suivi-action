import { WorkspaceRepository } from '@/db/repositories/workspace';
import { useEffect, useState, type ReactNode } from 'react';
import { LearningRepository } from '@/db/repositories/learning';
import { SpiritualRepository } from '@/db/repositories/spiritual';
import { HabitRepository } from '@/db/repositories/habits';
import { ReportsRepository } from '@/db/repositories/reports';
import { ArchiveRepository } from '@/db/repositories/archive';
import { DbContext, type DbContextValue, type Repositories } from './databaseContext';
import { initRuntime, save } from '@/db/runtime';
import { LifeAreaRepository } from '@/db/repositories/lifeAreas';
import { GoalRepository } from '@/db/repositories/goals';
import { TaskRepository } from '@/db/repositories/tasks';
import { StepRepository } from '@/db/repositories/steps';
import { ProjectRepository } from '@/db/repositories/projects';
import { SubtaskRepository } from '@/db/repositories/subtasks';
import { ProgressService } from '@/db/services/progressService';
import { PlanningRepository } from '@/db/repositories/planning';
import { FocusRepository } from '@/db/repositories/focus';
import { useSaveStatus } from '@/app/stores/saveStatus';
import { useTranslation } from 'react-i18next';
import { atomicAsync } from '@/db/transaction';

type Phase = 'loading' | 'ready' | 'error';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('loading');
  const [value, setValue] = useState<DbContextValue | null>(null);
  const setStatus = useSaveStatus((s) => s.setStatus);

  useEffect(() => {
    let active = true;
    initRuntime()
      .then(async (handle) => {
        if (!active) return;
        const repos: Repositories = {
          workspace: new WorkspaceRepository(handle.db),
          spiritual: new SpiritualRepository(handle.db),
          learning: new LearningRepository(handle.db),
          archive: new ArchiveRepository(handle.db),
          reports: new ReportsRepository(handle.db),
          habits: new HabitRepository(handle.db),
          lifeAreas: new LifeAreaRepository(handle.db),
          goals: new GoalRepository(handle.db),
          tasks: new TaskRepository(handle.db),
          steps: new StepRepository(handle.db),
          projects: new ProjectRepository(handle.db),
          subtasks: new SubtaskRepository(handle.db),
          planning: new PlanningRepository(handle.db),
          focus: new FocusRepository(handle.db),
        };
        if (await repos.focus.active()) {
          await repos.focus.recover();
          await save();
        }
        const progress = new ProgressService(handle.db);
        let queue: Promise<unknown> = Promise.resolve();
        const commit = <T,>(fn: () => Promise<T>): Promise<T> => {
          const operation = queue.then(async () => {
            setStatus('saving');
            try {
              const result = await atomicAsync(handle.db, fn);
              await save();
              setStatus('saved');
              return result;
            } catch (err) {
              setStatus('error');
              throw err;
            }
          });
          queue = operation.catch(() => undefined);
          return operation;
        };
        setValue({ repos, progress, commit });
        setPhase('ready');
      })
      .catch(() => active && setPhase('error'));
    return () => {
      active = false;
    };
  }, [setStatus]);

  if (phase === 'loading') {
    return (
      <div className="grid h-full place-items-center text-fg-muted" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (phase === 'error' || !value) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-danger" role="alert">
        {t('common.error')}
      </div>
    );
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}
