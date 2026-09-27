import { Check, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@/db/repositories/tasks';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { cn } from '@/shared/lib/cn';
import { InlineAdd } from './InlineAdd';
import { TaskEditButton } from '@/features/execution/TaskEditor';

export function TaskRow({
  task,
  onToggle,
  onDelete,
  onUpdated,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="goal-task-row group flex items-center gap-3 rounded-md px-2 hover:bg-surface-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.title}
        onClick={() => onToggle(task)}
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
          task.completed
            ? 'border-primary bg-primary text-primary-fg'
            : 'border-border hover:border-primary',
        )}
      >
        {task.completed ? <Check className="h-3.5 w-3.5" /> : null}
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          task.completed ? 'text-fg-muted line-through' : 'text-fg',
        )}
      >
        {task.title}
      </span>
      <TaskEditButton task={task} onSaved={onUpdated} />
      <button
        type="button"
        aria-label={t('common.delete')}
        onClick={() => onDelete(task)}
        className="rounded p-1 text-fg-muted opacity-0 transition-opacity hover:bg-surface hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** A titled card (a Step or a Project) with its progress bar and its tasks. */
export function TaskGroupCard({
  title,
  progress,
  tasks,
  onAddTask,
  onToggle,
  onDelete,
  onDeleteGroup,
  onUpdated,
}: {
  title: string;
  progress: number;
  tasks: Task[];
  onAddTask: (title: string) => Promise<void>;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDeleteGroup?: () => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="task-group surface">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="min-w-0 flex-1 truncate font-medium text-fg">{title}</h3>
        <span className="text-xs font-medium text-fg-muted">{Math.round(progress)}%</span>
        {onDeleteGroup ? (
          <button
            type="button"
            aria-label={t('common.delete')}
            onClick={onDeleteGroup}
            className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <ProgressBar
        value={progress}
        tone={progress >= 100 ? 'success' : 'primary'}
        className="mb-3"
      />
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
            onUpdated={onUpdated}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="px-2 py-1 text-xs text-fg-muted">{t('tasks.empty')}</p>
        ) : null}
      </div>
      <div className="mt-2">
        <InlineAdd placeholder={t('tasks.placeholder')} label={t('tasks.add')} onAdd={onAddTask} />
      </div>
    </div>
  );
}
