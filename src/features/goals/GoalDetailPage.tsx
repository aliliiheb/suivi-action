import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ArrowLeft, Clock, Pencil, Archive, Trash2 } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { GoalStep } from '@/db/repositories/steps';
import type { Project } from '@/db/repositories/projects';
import type { Task } from '@/db/repositories/tasks';
import type { LifeArea } from '@/db/repositories/lifeAreas';
import { ProgressRing } from '@/shared/ui/components/ProgressRing';
import { Button } from '@/shared/ui/components/Button';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { formatDuration } from '@/shared/lib/time';
import { InlineAdd } from './InlineAdd';
import { TaskRow, TaskGroupCard } from './TaskItems';
import { GoalFormDialog, type GoalFormValues } from './GoalFormDialog';
import { ManualProgressControl } from './ManualProgressControl';
import { GoalMetricsPanel } from './GoalMetricsPanel';
import { GoalOverview, GoalNotes, GoalHabits } from './GoalOverview';
import { goalIcon } from './goalPresentation';
import { GOAL_STATUS, type GoalStatus } from '@/domain/enums';

interface Grouped<T> {
  group: T;
  tasks: Task[];
}

export function GoalDetailPage({
  goalId: id,
  onChanged,
}: {
  goalId: string;
  onChanged: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { repos, commit, progress } = useDb();

  const [goal, setGoal] = useState<GoalWithArea | null>(null);
  const [steps, setSteps] = useState<Grouped<GoalStep>[]>([]);
  const [projectGroups, setProjectGroups] = useState<Grouped<Project>[]>([]);
  const [directTasks, setDirectTasks] = useState<Task[]>([]);
  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState('overview');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  const reload = useCallback(async () => {
    const g = await repos.goals.getById(id);
    if (!g) {
      setGoal(null);
      setLoading(false);
      return;
    }
    const [stepRows, projectRows, direct, areaRows] = await Promise.all([
      repos.steps.listByGoal(id),
      repos.projects.listByGoal(id),
      repos.tasks.listDirectByGoal(id),
      repos.lifeAreas.list(),
    ]);
    const stepsWT = await Promise.all(
      stepRows.map(async (group) => ({ group, tasks: await repos.tasks.listByStep(group.id) })),
    );
    const projectsWT = await Promise.all(
      projectRows.map(async (group) => ({
        group,
        tasks: await repos.tasks.listByProject(group.id),
      })),
    );
    setGoal(g);
    setSteps(stepsWT);
    setProjectGroups(projectsWT);
    setDirectTasks(direct);
    setAreas(areaRows);
    setLoading(false);
  }, [id, repos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refresh = async () => {
    await reload();
    await onChanged();
  };

  const recomputeAnd = (fn: () => Promise<void>) =>
    commit(async () => {
      await fn();
      await progress.recomputeGoal(id);
    }).then(refresh);

  const addStep = (title: string) =>
    recomputeAnd(async () => {
      await repos.steps.create({ goalId: id, title });
    });
  const addProject = (title: string) =>
    recomputeAnd(async () => {
      await repos.projects.create({ goalId: id, title });
    });
  const addTask = (target: { stepId?: string; projectId?: string }, title: string) =>
    recomputeAnd(async () => {
      await repos.tasks.create({ title, goalId: id, ...target });
    });
  const toggleTask = (task: Task) =>
    recomputeAnd(() => repos.tasks.setCompleted(task.id, !task.completed));
  const deleteTask = (task: Task) => recomputeAnd(() => repos.tasks.softDelete(task.id));
  const deleteStep = (stepId: string) => recomputeAnd(() => repos.steps.softDelete(stepId));
  const deleteProject = (projectId: string) =>
    recomputeAnd(() => repos.projects.softDelete(projectId));
  const setManualProgress = (value: number) =>
    recomputeAnd(() => repos.goals.update(id, { manualProgress: value }));

  const editGoal = async (values: GoalFormValues) => {
    await commit(async () => {
      await repos.goals.update(id, values);
      await progress.recomputeGoal(id);
    });
    await refresh();
  };
  const archiveGoal = async () => {
    await commit(() => repos.goals.archive(id));
    await onChanged();
    navigate('/goals');
  };
  const deleteGoal = async () => {
    await commit(() => repos.goals.softDelete(id));
    await onChanged();
    navigate('/goals');
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-fg-muted">{t('common.loading')}</p>;
  }
  if (!goal) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-fg-muted">{t('common.error')}</p>
        <Link to="/goals" className="mt-3 inline-block text-sm text-primary">
          {t('goals.back')}
        </Link>
      </div>
    );
  }

  const Icon = goalIcon(goal.goalType);
  const allTasks = Array.from(
    new Map(
      [
        ...steps.flatMap((s) => s.tasks),
        ...projectGroups.flatMap((p) => p.tasks),
        ...directTasks,
      ].map((task) => [task.id, task]),
    ).values(),
  );
  return (
    <article className="page-stack goal-detail objective-detail" aria-label={goal.title}>
      <Link
        to="/goals"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('goals.back')}
      </Link>

      {/* Header */}
      <div className="goal-hero surface">
        <div className="objective-emblem">
          <Icon size={30} />
        </div>
        <div className="goal-hero-copy">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-fg">{goal.title}</h2>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.edit')}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.archive')}
                onClick={() => void archiveGoal()}
              >
                <Archive className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {goal.areaName ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: goal.areaColor ?? 'hsl(var(--muted))' }}
              />
              {goal.areaName}
            </div>
          ) : null}
          <p className="mt-2 text-xs font-medium text-primary">
            {t(`goalTypes.types.${goal.goalType}`)}
          </p>
          <select
            className="objective-status-select"
            aria-label={t('goalStudio.status')}
            value={goal.status}
            disabled={statusBusy}
            onChange={async (event) => {
              const status = event.target.value as GoalStatus;
              setStatusBusy(true);
              setStatusError('');
              try {
                await commit(() => repos.goals.update(id, { status }));
                await refresh();
              } catch {
                setStatusError(t('common.error'));
              } finally {
                setStatusBusy(false);
              }
            }}
          >
            {GOAL_STATUS.filter((status) => status !== 'archived').map((status) => (
              <option key={status} value={status}>
                {t(`goalStudio.statuses.${status}`)}
              </option>
            ))}
          </select>
          {statusError && <p role="alert">{statusError}</p>}

          <div className="mt-4">
            <div className="hero-meta flex items-center text-sm">
              <span className="inline-flex items-center gap-3 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(goal.investedMin, t('common.minShort'))}
                </span>
                <span>
                  {goal.deadline ? format(goal.deadline, 'dd/MM/yyyy') : t('goals.noDeadline')}
                </span>
              </span>
            </div>
            {goal.progressMethod === 'manual' ? (
              <ManualProgressControl
                value={goal.manualProgress ?? goal.progress}
                label={t('goals.manualLabel')}
                onSet={setManualProgress}
              />
            ) : null}
          </div>
        </div>
        <ProgressRing value={goal.progress} label={goal.title} />
      </div>

      <nav className="objective-tabs" aria-label={t('goalStudio.sections')}>
        {['overview', 'steps', 'tasks', 'habits', 'statistics', 'notes', 'resources'].map(
          (value) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {t(`goalStudio.tabs.${value}`)}
            </button>
          ),
        )}
      </nav>
      {tab === 'overview' && (
        <GoalOverview
          goal={goal}
          steps={steps.map((s) => s.group)}
          tasks={allTasks}
          onOpen={setTab}
          onEdit={() => setTab('notes')}
        />
      )}
      {tab === 'statistics' && (
        <>
          <GoalOverview
            goal={goal}
            steps={steps.map((s) => s.group)}
            tasks={allTasks}
            statisticsOnly
            onOpen={setTab}
            onEdit={() => setTab('notes')}
          />
          <GoalMetricsPanel goal={goal} onSaved={refresh} />
        </>
      )}
      {tab === 'habits' && <GoalHabits goalId={id} />}
      {(tab === 'notes' || tab === 'resources') && (
        <GoalNotes
          goal={goal}
          resources={tab === 'resources'}
          onSave={async (description) => {
            await commit(() => repos.goals.update(id, { description }));
            await refresh();
          }}
        />
      )}
      <div className="goal-sections" hidden={!['steps', 'tasks'].includes(tab)}>
        <section className="goal-stages space-y-3" hidden={tab !== 'steps'}>
          <h2 className="section-heading text-fg-muted">{t('steps.title')}</h2>
          {steps.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('steps.empty')}</p>
          ) : (
            <div className="space-y-3">
              {steps.map(({ group, tasks }) => (
                <TaskGroupCard
                  key={group.id}
                  title={group.title}
                  progress={group.progress}
                  tasks={tasks}
                  onUpdated={refresh}
                  onAddTask={(title) => addTask({ stepId: group.id }, title)}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onDeleteGroup={() => void deleteStep(group.id)}
                />
              ))}
            </div>
          )}
          <div className="max-w-sm">
            <InlineAdd
              placeholder={t('steps.placeholder')}
              label={t('steps.add')}
              onAdd={addStep}
            />
          </div>
        </section>

        {/* Projects */}
        <section className="space-y-3" hidden={tab !== 'tasks'}>
          <h2 className="section-heading text-fg-muted">{t('projects.title')}</h2>
          {projectGroups.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('projects.empty')}</p>
          ) : (
            <div className="space-y-3">
              {projectGroups.map(({ group, tasks }) => (
                <TaskGroupCard
                  key={group.id}
                  title={group.title}
                  progress={group.progress}
                  tasks={tasks}
                  onUpdated={refresh}
                  onAddTask={(title) => addTask({ projectId: group.id }, title)}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onDeleteGroup={() => void deleteProject(group.id)}
                />
              ))}
            </div>
          )}
          <div className="max-w-sm">
            <InlineAdd
              placeholder={t('projects.placeholder')}
              label={t('projects.add')}
              onAdd={addProject}
            />
          </div>
        </section>

        {/* Direct tasks */}
        <section className="space-y-3" hidden={tab !== 'tasks'}>
          {steps.some((s) => s.tasks.length) && (
            <div className="surface p-4">
              {steps
                .flatMap((s) => s.tasks)
                .map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onUpdated={refresh}
                  />
                ))}
            </div>
          )}
          <h2 className="section-heading text-fg-muted">{t('tasks.directTitle')}</h2>
          <div className="surface p-5">
            <div className="space-y-0.5">
              {directTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onUpdated={refresh}
                />
              ))}
              {directTasks.length === 0 ? (
                <p className="px-2 py-1 text-xs text-fg-muted">{t('tasks.empty')}</p>
              ) : null}
            </div>
            <div className="mt-2">
              <InlineAdd
                placeholder={t('tasks.placeholder')}
                label={t('tasks.add')}
                onAdd={(title) => addTask({}, title)}
              />
            </div>
          </div>
        </section>
      </div>
      <GoalFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        areas={areas}
        initial={goal}
        onSubmit={editGoal}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={t('goals.confirmDeleteTitle')}>
          <p className="text-sm text-fg-muted">{t('goals.confirmDeleteBody')}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteGoal()}>
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
