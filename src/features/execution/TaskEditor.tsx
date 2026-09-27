import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { Task, CreateTaskInput } from '@/db/repositories/tasks';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { GoalStep } from '@/db/repositories/steps';
import type { Project } from '@/db/repositories/projects';
import { PRIORITY, type Priority } from '@/domain/enums';
import { dayKey } from '@/shared/lib/time';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { Field } from '@/shared/ui/components/Field';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';

const selectClass = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg';

export function TaskEditButton({
  task,
  onSaved,
}: {
  task: Task;
  onSaved?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('tasks.edit')}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {open ? <TaskEditor task={task} onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}

function TaskEditor({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { repos, commit, progress } = useDb();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [goalId, setGoalId] = useState(task.goalId ?? '');
  const [group, setGroup] = useState(
    task.stepId ? `step:${task.stepId}` : task.projectId ? `project:${task.projectId}` : '',
  );
  const [priority, setPriority] = useState(task.priority as Priority);
  const [plannedDate, setPlannedDate] = useState(
    task.plannedDate === null ? '' : dayKey(task.plannedDate),
  );
  const [deadline, setDeadline] = useState(task.deadline === null ? '' : dayKey(task.deadline));
  const [estimate, setEstimate] = useState(
    task.estimatedMin === null ? '' : String(task.estimatedMin),
  );
  const [weight, setWeight] = useState(String(task.weight));
  const [goals, setGoals] = useState<GoalWithArea[]>([]);
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      repos.goals.list(),
      goalId ? repos.steps.listByGoal(goalId) : Promise.resolve([]),
      goalId ? repos.projects.listByGoal(goalId) : Promise.resolve([]),
    ])
      .then(([goals, steps, projects]) => {
        if (active) {
          setGoals(goals);
          setSteps(steps);
          setProjects(projects);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [goalId, repos]);

  const submit = async () => {
    if (busy || loading || !title.trim()) return;
    setBusy(true);
    setError(false);
    const patch: CreateTaskInput = {
      title,
      description: description || null,
      goalId: goalId || null,
      stepId: group.startsWith('step:') ? group.slice(5) : null,
      projectId: group.startsWith('project:') ? group.slice(8) : null,
      priority,
      plannedDate: plannedDate ? new Date(`${plannedDate}T00:00:00`).getTime() : null,
      deadline: deadline ? new Date(`${deadline}T23:59:59.999`).getTime() : null,
      estimatedMin: estimate === '' ? null : Number(estimate),
      weight: Number(weight),
    };
    try {
      await commit(async () => {
        await repos.tasks.update(task.id, patch);
        if (task.goalId && task.goalId !== goalId) await progress.recomputeGoal(task.goalId);
        if (goalId) await progress.recomputeGoal(goalId);
      });
      await onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent title={t('tasks.edit')} className="max-h-[90vh] overflow-y-auto">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={t('goals.titleLabel')} htmlFor="task-title">
            <Input
              id="task-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t('tasks.description')} htmlFor="task-description">
            <textarea
              id="task-description"
              className={`${selectClass} h-20 py-2`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={t('inbox.assign')} htmlFor="task-goal">
            <select
              id="task-goal"
              className={selectClass}
              value={goalId}
              onChange={(e) => {
                setGoalId(e.target.value);
                setGroup('');
              }}
            >
              <option value="">{t('tasks.noGoal')}</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('tasks.group')} htmlFor="task-group">
            <select
              id="task-group"
              className={selectClass}
              value={group}
              disabled={!goalId || loading}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">{t('tasks.directTitle')}</option>
              {steps.map((step) => (
                <option key={step.id} value={`step:${step.id}`}>
                  {t('steps.title')} · {step.title}
                </option>
              ))}
              {projects.map((project) => (
                <option key={project.id} value={`project:${project.id}`}>
                  {t('projects.title')} · {project.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('tasks.plannedDate')} htmlFor="task-planned">
              <Input
                id="task-planned"
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </Field>
            <Field label={t('goals.deadlineLabel')} htmlFor="task-deadline">
              <Input
                id="task-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            <Field label={t('tasks.estimate')} htmlFor="task-estimate">
              <Input
                id="task-estimate"
                type="number"
                min="1"
                step="1"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </Field>
            <Field label={t('goals.priorityLabel')} htmlFor="task-priority">
              <select
                id="task-priority"
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITY.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`tasks.${priority}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('tasks.weight')} htmlFor="task-weight">
            <Input
              id="task-weight"
              type="number"
              required
              min="0.01"
              step="0.01"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {t('common.error')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || loading || !title.trim()}>
              {t(busy ? 'common.saving' : 'common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
