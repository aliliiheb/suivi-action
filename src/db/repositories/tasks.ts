import { atomic } from '../transaction';
/** Task repository (spec §10, §11, §24). */
import { and, asc, desc, eq, gte, isNull, lt, lte, notInArray, or, ne } from 'drizzle-orm';
import type { InferSelectModel, SQL } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { tasks, goals, lifeAreas, goalSteps, projects, dailyPriorities, subtasks } from '../schema';
import { newId } from '@/shared/lib/id';
import { nowMs, startOfDayMs, dayKey } from '@/shared/lib/time';
import type { Priority, TaskStatus } from '@/domain/enums';

export type Task = InferSelectModel<typeof tasks>;

/** A task enriched with its goal/area/step/project labels for the chain (§12). */
export interface TaskWithContext extends Task {
  goalTitle: string | null;
  goalType?: string | null;
  areaName: string | null;
  areaColor: string | null;
  stepTitle: string | null;
  projectTitle: string | null;
}

// Statuses that should never appear in operational lists (Today/Inbox/overdue).
const HIDDEN_STATUS = ['cancelled', 'archived'];

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  goalId?: string | null;
  stepId?: string | null;
  projectId?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  estimatedMin?: number | null;
  plannedDate?: number | null;
  deadline?: number | null;
  weight?: number;
}

export class TaskRepository {
  constructor(private readonly db: AppDatabase) {}

  private baseAlive() {
    return isNull(tasks.deletedAt);
  }

  async listByStep(stepId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.stepId, stepId), this.baseAlive()))
      .orderBy(asc(tasks.createdAt));
  }

  async listByProject(projectId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), this.baseAlive()))
      .orderBy(asc(tasks.createdAt));
  }

  /** Tasks attached to the goal directly (no step, no project). */
  async listDirectByGoal(goalId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.goalId, goalId),
          isNull(tasks.stepId),
          isNull(tasks.projectId),
          this.baseAlive(),
        ),
      )
      .orderBy(asc(tasks.createdAt));
  }

  async getById(id: string): Promise<Task | undefined> {
    return (await this.db.select().from(tasks).where(eq(tasks.id, id)))[0];
  }

  async create(input: CreateTaskInput): Promise<string> {
    await this.validate(input);
    const now = nowMs();
    const id = newId();
    await this.db.insert(tasks).values({
      id,
      title: input.title.trim(),
      description: input.description ?? null,
      goalId: input.goalId ?? null,
      stepId: input.stepId ?? null,
      projectId: input.projectId ?? null,
      priority: input.priority ?? 'p3',
      status: input.status ?? 'planned',
      estimatedMin: input.estimatedMin ?? null,
      plannedDate: input.plannedDate ?? null,
      deadline: input.deadline ?? null,
      weight: input.weight ?? 1,
      spentMin: 0,
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  /** Complete/uncomplete in one click (spec §10). */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    const now = nowMs();
    const task = await this.getById(id);
    if (!task || task.deletedAt) throw new Error('Unavailable task');
    const status = completed
      ? 'done'
      : task.plannedDate !== null
        ? 'planned'
        : task.goalId
          ? 'to_plan'
          : 'inbox';
    atomic(this.db, (tx) => {
      tx.update(tasks)
        .set({
          completed,
          status,
          completedAt: completed ? now : null,
          updatedAt: now,
        })
        .where(eq(tasks.id, id))
        .run();
      tx.update(subtasks)
        .set({ completed, completedAt: completed ? now : null, updatedAt: now })
        .where(eq(subtasks.taskId, id))
        .run();
    });
  }

  async update(
    id: string,
    patch: Partial<CreateTaskInput> & { status?: TaskStatus },
  ): Promise<void> {
    const before = await this.getById(id);
    if (!before || before.deletedAt) throw new Error('Unavailable task');
    await this.validate({ ...before, ...patch } as CreateTaskInput);
    const next: Record<string, unknown> = { updatedAt: nowMs() };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) next[key] = value;
    }
    if (typeof patch.title === 'string') next.title = patch.title.trim();
    if (patch.status !== undefined) {
      next.completed = patch.status === 'done';
      next.completedAt = patch.status === 'done' ? (before.completedAt ?? nowMs()) : null;
    } else if (
      patch.plannedDate !== undefined &&
      !before.completed &&
      !HIDDEN_STATUS.includes(before.status)
    ) {
      next.status =
        patch.plannedDate !== null
          ? 'planned'
          : (patch.goalId === undefined ? before.goalId : patch.goalId)
            ? 'to_plan'
            : 'inbox';
    }
    await this.db.update(tasks).set(next).where(eq(tasks.id, id));
    if (patch.plannedDate !== undefined) await this.clearOtherPriorities(id, patch.plannedDate);
  }

  async softDelete(id: string): Promise<void> {
    await this.db.update(tasks).set({ deletedAt: nowMs() }).where(eq(tasks.id, id));
  }

  private async validate(input: CreateTaskInput): Promise<void> {
    if (!input.title.trim()) throw new Error('Title required');
    for (const value of [input.plannedDate, input.deadline])
      if (value != null && !Number.isFinite(value)) throw new Error('Invalid date');
    if (
      input.estimatedMin != null &&
      (!Number.isFinite(input.estimatedMin) || input.estimatedMin <= 0)
    )
      throw new Error('Invalid duration');
    if (input.weight != null && (!Number.isFinite(input.weight) || input.weight <= 0))
      throw new Error('Invalid weight');
    if (input.goalId) {
      const goal = this.db.select().from(goals).where(eq(goals.id, input.goalId)).get();
      if (!goal || goal.deletedAt || goal.archivedAt) throw new Error('Unavailable goal');
    }
    if (input.stepId) {
      const step = this.db.select().from(goalSteps).where(eq(goalSteps.id, input.stepId)).get();
      if (!step || step.deletedAt || step.goalId !== input.goalId)
        throw new Error('Invalid step relationship');
    }
    if (input.projectId) {
      const project = this.db.select().from(projects).where(eq(projects.id, input.projectId)).get();
      if (!project || project.deletedAt || project.goalId !== input.goalId)
        throw new Error('Invalid project relationship');
    }
  }

  listActive(): Promise<TaskWithContext[]> {
    return this.withContext(
      and(
        isNull(tasks.deletedAt),
        eq(tasks.completed, false),
        notInArray(tasks.status, HIDDEN_STATUS),
      ),
    );
  }

  listCalendar(start: number, end: number): Promise<TaskWithContext[]> {
    return this.withContext(
      and(
        isNull(tasks.deletedAt),
        notInArray(tasks.status, HIDDEN_STATUS),
        or(
          and(gte(tasks.plannedDate, start), lte(tasks.plannedDate, end)),
          and(gte(tasks.deadline, start), lte(tasks.deadline, end)),
        ),
      ),
    );
  }

  async getWithContext(id: string): Promise<TaskWithContext | undefined> {
    return (await this.withContext(eq(tasks.id, id)))[0];
  }

  private async clearOtherPriorities(id: string, plannedDate: number | null) {
    await this.db
      .delete(dailyPriorities)
      .where(
        and(
          eq(dailyPriorities.taskId, id),
          plannedDate === null ? undefined : ne(dailyPriorities.date, dayKey(plannedDate)),
        ),
      );
  }

  // ── Phase 3: operational queries (Today / Inbox / overdue) ─────────────────

  /** Run the joined context select with a given WHERE, ordered by createdAt. */
  private async withContext(where: SQL | undefined, order: 'asc' | 'desc' = 'asc') {
    const rows = await this.db
      .select({
        task: tasks,
        goalTitle: goals.title,
        goalType: goals.goalType,
        areaName: lifeAreas.name,
        areaColor: lifeAreas.color,
        stepTitle: goalSteps.title,
        projectTitle: projects.title,
      })
      .from(tasks)
      .leftJoin(goals, eq(tasks.goalId, goals.id))
      .leftJoin(lifeAreas, eq(goals.areaId, lifeAreas.id))
      .leftJoin(goalSteps, eq(tasks.stepId, goalSteps.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          where,
          isNull(goals.deletedAt),
          isNull(goals.archivedAt),
          isNull(goalSteps.deletedAt),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(order === 'asc' ? asc(tasks.createdAt) : desc(tasks.createdAt));
    return rows.map<TaskWithContext>((r) => ({
      ...r.task,
      goalTitle: r.goalTitle,
      goalType: r.goalType,
      areaName: r.areaName,
      areaColor: r.areaColor,
      stepTitle: r.stepTitle,
      projectTitle: r.projectTitle,
    }));
  }

  /** Quick-capture items with no home yet (spec §17). */
  listInbox(): Promise<TaskWithContext[]> {
    return this.withContext(and(eq(tasks.status, 'inbox'), isNull(tasks.deletedAt)), 'desc');
  }

  /** Not-completed tasks planned within [startMs, endMs] (a given day, §15). */
  listPlannedActiveBetween(startMs: number, endMs: number): Promise<TaskWithContext[]> {
    return this.withContext(
      and(
        gte(tasks.plannedDate, startMs),
        lte(tasks.plannedDate, endMs),
        eq(tasks.completed, false),
        notInArray(tasks.status, HIDDEN_STATUS),
        isNull(tasks.deletedAt),
      ),
    );
  }

  /** Not-completed tasks whose planned date is before `todayStartMs` (overdue, §41). */
  listOverdue(todayStartMs: number): Promise<TaskWithContext[]> {
    return this.withContext(
      and(
        or(lt(tasks.plannedDate, todayStartMs), lt(tasks.deadline, todayStartMs)),
        eq(tasks.completed, false),
        notInArray(tasks.status, [...HIDDEN_STATUS, 'inbox']),
        isNull(tasks.deletedAt),
      ),
    );
  }

  /** Tasks completed within [startMs, endMs] (Completed today, §15). */
  listCompletedBetween(startMs: number, endMs: number): Promise<TaskWithContext[]> {
    return this.withContext(
      and(
        eq(tasks.completed, true),
        gte(tasks.completedAt, startMs),
        lte(tasks.completedAt, endMs),
        isNull(tasks.deletedAt),
      ),
    );
  }

  /** Add a quick inbox capture (spec §17). */
  createInbox(title: string): Promise<string> {
    return this.create({ title, status: 'inbox' });
  }

  /** Set (or clear) the planned date; planning a date moves it out of the inbox (§24). */
  async setPlannedDate(id: string, dayMs: number | null): Promise<void> {
    await this.update(id, { plannedDate: dayMs });
  }

  /** Move a task to today's plan (spec §15, §41). */
  planForToday(id: string): Promise<void> {
    return this.setPlannedDate(id, startOfDayMs());
  }
}
