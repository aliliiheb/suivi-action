/**
 * ProgressService — the ONE place that recomputes and propagates progression
 * (spec §13, §87). When anything relevant changes (a task completed, a subtask
 * toggled, a numeric value updated), call `recomputeGoal(goalId)`: it recomputes
 * every Step/Project from its tasks, then the Goal from its method, and writes
 * the cached `progress` / `investedMin` fields. UI never does this maths.
 *
 * Rollup: Task → Step/Project → Goal. Area progress is derived on read (analytics)
 * from its goals, so there is nothing to cache above Goal.
 */
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import {
  goals,
  goalSteps,
  projects,
  tasks,
  subtasks,
  goalHybridComponents,
  goalProgressSnapshots,
  goalMetrics,
  focusSessions,
} from '../schema';
import {
  taskProgress,
  rollupProgress,
  numericProgress,
  hybridProgress,
  clampPercent,
  type WeightedNode,
  type HybridComponent,
} from '@/domain/progress/progressEngine';
import { nowMs, dayKey } from '@/shared/lib/time';
import { newId } from '@/shared/lib/id';
import { HabitRepository } from '../repositories/habits';
import { metricProgress } from '@/domain/goals/goalTypes';

// Tasks in these states do not count toward progress denominators.
const EXCLUDED_TASK_STATUS = ['cancelled', 'archived'];

export class ProgressService {
  constructor(private readonly db: AppDatabase) {}

  async recomputeGoal(goalId: string): Promise<void> {
    const goalRows = await this.db.select().from(goals).where(eq(goals.id, goalId));
    const goal = goalRows[0];
    if (!goal) return;

    // Load all non-deleted, countable tasks of this goal in one query.
    const goalTasks = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.goalId, goalId),
          isNull(tasks.deletedAt),
          notInArray(tasks.status, EXCLUDED_TASK_STATUS),
        ),
      );

    // Load subtasks for those tasks (for subtask-based task progress).
    const taskIds = goalTasks.map((t) => t.id);
    const subs = taskIds.length
      ? await this.db.select().from(subtasks).where(inArray(subtasks.taskId, taskIds))
      : [];
    const subsByTask = new Map<string, { completed: boolean }[]>();
    for (const s of subs) {
      const list = subsByTask.get(s.taskId) ?? [];
      list.push({ completed: s.completed });
      subsByTask.set(s.taskId, list);
    }

    const progressOf = (t: { id: string; completed: boolean }): number =>
      taskProgress({ completed: t.completed, subtasks: subsByTask.get(t.id) });

    const now = nowMs();
    const sessions = this.db
      .select()
      .from(focusSessions)
      .where(and(eq(focusSessions.goalId, goalId), eq(focusSessions.state, 'stopped')))
      .all();
    const sessionsByTask = new Set(sessions.map((session) => session.taskId));
    // Session context is historical: moving/deleting a task must not erase work.
    const investedFor = (
      items: typeof goalTasks,
      matches: (session: (typeof sessions)[number]) => boolean,
    ) =>
      sessions.filter(matches).reduce((sum, session) => sum + session.durationMin, 0) +
      items
        .filter((task) => !sessionsByTask.has(task.id))
        .reduce((sum, task) => sum + task.spentMin, 0);

    // ── Steps: progress = weighted rollup of their tasks ──────────────────────
    const steps = await this.db
      .select()
      .from(goalSteps)
      .where(and(eq(goalSteps.goalId, goalId), isNull(goalSteps.deletedAt)));
    const stepProgress = new Map<string, number>();
    for (const step of steps) {
      const stepTasks = goalTasks.filter((t) => t.stepId === step.id);
      const progress = rollupProgress(
        stepTasks.map<WeightedNode>((t) => ({ progress: progressOf(t), weight: t.weight })),
      );
      const invested = investedFor(stepTasks, (session) => session.stepId === step.id);
      stepProgress.set(step.id, progress);
      await this.db
        .update(goalSteps)
        .set({ progress, investedMin: invested, updatedAt: now })
        .where(eq(goalSteps.id, step.id));
    }

    // ── Projects: same rollup ────────────────────────────────────────────────
    const projectRows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.goalId, goalId), isNull(projects.deletedAt)));
    const projectProgress = new Map<string, number>();
    for (const project of projectRows) {
      const projectTasks = goalTasks.filter((t) => t.projectId === project.id);
      const progress = rollupProgress(
        projectTasks.map<WeightedNode>((t) => ({ progress: progressOf(t), weight: t.weight })),
      );
      const invested = investedFor(projectTasks, (session) => session.projectId === project.id);
      projectProgress.set(project.id, progress);
      await this.db
        .update(projects)
        .set({ progress, investedMin: invested, updatedAt: now })
        .where(eq(projects.id, project.id));
    }

    // Nodes for the goal-level rollup: steps + projects + tasks attached directly.
    const stepNodes: WeightedNode[] = steps.map((s) => ({
      progress: stepProgress.get(s.id) ?? 0,
      weight: s.weight,
    }));
    const projectNodes: WeightedNode[] = projectRows.map((p) => ({
      progress: projectProgress.get(p.id) ?? 0,
      weight: p.weight,
    }));
    const directNodes: WeightedNode[] = goalTasks
      .filter((t) => !t.stepId && !t.projectId)
      .map((t) => ({ progress: progressOf(t), weight: t.weight }));
    const taskNodes = [...stepNodes, ...projectNodes, ...directNodes];

    // ── Goal, by method (spec §8) ────────────────────────────────────────────
    let goalProgress: number;
    switch (goal.progressMethod) {
      case 'metrics': {
        const metrics = this.db
          .select()
          .from(goalMetrics)
          .where(and(eq(goalMetrics.goalId, goalId), eq(goalMetrics.active, true)))
          .all();
        const hours = sessions.reduce((sum, session) => sum + session.durationMin, 0) / 60;
        for (const metric of metrics) {
          if (metric.source === 'focus') {
            metric.current = hours;
            this.db
              .update(goalMetrics)
              .set({ current: hours, updatedAt: now })
              .where(eq(goalMetrics.id, metric.id))
              .run();
          }
        }
        goalProgress = metricProgress(metrics);
        break;
      }
      case 'numeric':
        goalProgress = numericProgress(goal.currentValue ?? 0, goal.targetValue ?? 0);
        break;
      case 'manual':
        goalProgress = clampPercent(goal.manualProgress ?? 0);
        break;
      case 'hybrid':
        goalProgress = await this.hybridGoalProgress(goalId, goal, taskNodes);
        break;
      case 'tasks':
      default:
        goalProgress = rollupProgress(taskNodes);
        break;
    }

    const investedMin = investedFor(goalTasks, () => true);
    await this.db
      .update(goals)
      .set({ progress: goalProgress, investedMin, updatedAt: now })
      .where(eq(goals.id, goalId));
    const date = dayKey();
    const snapshot = this.db
      .select()
      .from(goalProgressSnapshots)
      .where(and(eq(goalProgressSnapshots.goalId, goalId), eq(goalProgressSnapshots.date, date)))
      .get();
    if (snapshot)
      this.db
        .update(goalProgressSnapshots)
        .set({ progress: goalProgress, investedMin })
        .where(eq(goalProgressSnapshots.id, snapshot.id))
        .run();
    else
      this.db
        .insert(goalProgressSnapshots)
        .values({ id: newId(), goalId, date, progress: goalProgress, investedMin, createdAt: now })
        .run();
  }

  private async hybridGoalProgress(
    goalId: string,
    goal: { currentValue: number | null; targetValue: number | null },
    taskNodes: WeightedNode[],
  ): Promise<number> {
    const components = await this.db
      .select()
      .from(goalHybridComponents)
      .where(eq(goalHybridComponents.goalId, goalId));
    if (components.length === 0) return rollupProgress(taskNodes);

    const parts: HybridComponent[] = [];
    for (const c of components) {
      if (c.kind === 'steps') {
        parts.push({ value: rollupProgress(taskNodes), weight: c.weight });
      } else if (c.kind === 'numeric') {
        parts.push({
          value: numericProgress(goal.currentValue ?? 0, goal.targetValue ?? 0),
          weight: c.weight,
        });
      } else if (c.kind === 'habits') {
        const rows = (await new HabitRepository(this.db).summary()).filter(
          (row) => row.habit.goalId === goalId && row.habit.active,
        );
        parts.push({
          value: rows.length
            ? rows.reduce((sum, row) => sum + row.stats.successRate, 0) / rows.length
            : 0,
          weight: c.weight,
        });
      }
    }
    return hybridProgress(parts);
  }
}
