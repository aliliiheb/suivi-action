import { Check } from 'lucide-react';
import { type ReactNode } from 'react';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { cn } from '@/shared/lib/cn';
import { useTranslation } from 'react-i18next';

/** The "why" chain for a task: Step/Project → Goal · Area (spec §12). */
export function TaskContextLine({ task }: { task: TaskWithContext }) {
  const chain = [task.projectTitle, task.stepTitle, task.goalTitle].filter(Boolean) as string[];
  if (chain.length === 0 && !task.areaName) return null;
  return (
    <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-fg-muted">
      {task.areaColor ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: task.areaColor }}
        />
      ) : null}
      <span className="truncate">
        {chain.join(' → ')}
        {task.areaName ? ` · ${task.areaName}` : ''}
      </span>
    </div>
  );
}

/** A task row for operational screens (Today / Inbox), with a right-side action slot. */
export function OperationalTaskRow({
  task,
  onToggle,
  children,
}: {
  task: TaskWithContext;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="task-row group flex items-center gap-3 border border-border bg-surface transition-colors hover:border-primary/30">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.title}
        onClick={onToggle}
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
          task.completed
            ? 'border-primary bg-primary text-primary-fg'
            : 'border-border hover:border-primary',
        )}
      >
        {task.completed ? <Check className="h-3.5 w-3.5" /> : null}
      </button>
      <div className="task-copy min-w-0 flex-1">
        <span
          className={cn(
            'task-title block text-sm',
            task.completed ? 'text-fg-muted line-through' : 'text-fg',
          )}
        >
          {task.title}
        </span>
        <TaskContextLine task={task} />
        <span className="task-metadata mt-1 block text-xs text-fg-muted">
          {t(`tasks.${task.priority}`)}
          {task.estimatedMin !== null ? ` · ${task.estimatedMin} ${t('common.minShort')}` : ''}
        </span>
      </div>
      {children ? (
        <div className="task-actions flex shrink-0 items-center gap-1">{children}</div>
      ) : null}
    </div>
  );
}
