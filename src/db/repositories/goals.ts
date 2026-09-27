/** Goal repository (spec §7). CRUD + list with its life-area label. */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { goals, lifeAreas, goalMetrics } from '../schema';
import { newId } from '@/shared/lib/id';
import { nowMs } from '@/shared/lib/time';
import {
  GOAL_TYPES,
  validateMetrics,
  GoalValidationError,
  type GoalType,
  type MetricInput,
} from '@/domain/goals/goalTypes';
import { atomicAsync } from '../transaction';
import { ProgressService } from '../services/progressService';
import type { GoalStatus, Priority, ProgressMethodName } from '@/domain/enums';

export type Goal = InferSelectModel<typeof goals>;

export type GoalMetric = InferSelectModel<typeof goalMetrics>;

export interface GoalWithArea extends Goal {
  metrics: GoalMetric[];
  areaName: string | null;
  areaColor: string | null;
}

export interface CreateGoalInput {
  goalType?: GoalType;
  metrics?: MetricInput[];
  currentValue?: number | null;
  title: string;
  description?: string | null;
  areaId?: string | null;
  priority?: Priority;
  progressMethod?: ProgressMethodName;
  deadline?: number | null;
  startDate?: number | null;
  targetValue?: number | null;
  unit?: string | null;
}

export interface UpdateGoalInput {
  goalType?: GoalType;
  metrics?: MetricInput[];
  title?: string;
  description?: string | null;
  areaId?: string | null;
  priority?: Priority;
  status?: GoalStatus;
  progressMethod?: ProgressMethodName;
  deadline?: number | null;
  startDate?: number | null;
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
  manualProgress?: number | null;
}

export class GoalRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<GoalWithArea[]> {
    const rows = await this.db
      .select({
        goal: goals,
        areaName: lifeAreas.name,
        areaColor: lifeAreas.color,
      })
      .from(goals)
      .leftJoin(lifeAreas, eq(goals.areaId, lifeAreas.id))
      .where(and(isNull(goals.deletedAt), isNull(goals.archivedAt)))
      .orderBy(desc(goals.createdAt));
    const metrics = await this.db.select().from(goalMetrics).where(eq(goalMetrics.active, true));
    const byGoal = new Map<string, GoalMetric[]>();
    for (const metric of metrics)
      byGoal.set(metric.goalId, [...(byGoal.get(metric.goalId) ?? []), metric]);
    return rows.map((r) => ({
      ...r.goal,
      areaName: r.areaName,
      areaColor: r.areaColor,
      metrics: byGoal.get(r.goal.id) ?? [],
    }));
  }

  async getById(id: string): Promise<GoalWithArea | undefined> {
    const rows = await this.db
      .select({ goal: goals, areaName: lifeAreas.name, areaColor: lifeAreas.color })
      .from(goals)
      .leftJoin(lifeAreas, eq(goals.areaId, lifeAreas.id))
      .where(eq(goals.id, id));
    const r = rows[0];
    return r
      ? {
          ...r.goal,
          areaName: r.areaName,
          areaColor: r.areaColor,
          metrics: await this.activeMetrics(id),
        }
      : undefined;
  }

  async create(input: CreateGoalInput): Promise<string> {
    const type = input.goalType ?? 'custom';
    this.validateGoal(input, type, input.metrics ?? []);
    return atomicAsync(this.db, async () => {
      const now = nowMs();
      const id = newId();
      await this.db.insert(goals).values({
        id,
        title: input.title.trim(),
        description: input.description ?? null,
        areaId: input.areaId ?? null,
        priority: input.priority ?? 'p3',
        status: 'active',
        goalType: type,
        progressMethod: type === 'custom' ? (input.progressMethod ?? 'tasks') : 'metrics',
        currentValue: input.currentValue ?? null,
        startDate: input.startDate ?? null,
        deadline: input.deadline ?? null,
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? null,
        progress: 0,
        investedMin: 0,
        createdAt: now,
        updatedAt: now,
      });
      await this.writeMetrics(id, input.metrics ?? []);
      await new ProgressService(this.db).recomputeGoal(id);
      return id;
    });
  }

  async update(id: string, patch: UpdateGoalInput): Promise<void> {
    const before = await this.getById(id);
    if (!before) throw new GoalValidationError('title', 'invalid');
    const type = patch.goalType ?? (before.goalType as GoalType);
    const metrics =
      patch.metrics ??
      (type === before.goalType
        ? before.metrics.map((metric) => ({
            ...metric,
            source: metric.source as 'manual' | 'focus',
          }))
        : []);
    const merged = { ...before, ...patch };
    this.validateGoal(merged, type, metrics);
    await atomicAsync(this.db, async () => {
      const next: Record<string, unknown> = { updatedAt: nowMs() };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined && key !== 'metrics') next[key] = value;
      }
      if (typeof patch.title === 'string') next.title = patch.title.trim();
      if (patch.status === 'done') next.completedAt = nowMs();
      if (type !== 'custom') next.progressMethod = 'metrics';
      await this.db.update(goals).set(next).where(eq(goals.id, id));
      if (patch.metrics !== undefined || patch.goalType !== undefined)
        await this.writeMetrics(id, metrics);
      await new ProgressService(this.db).recomputeGoal(id);
    });
  }

  async activeMetrics(goalId: string): Promise<GoalMetric[]> {
    return this.db
      .select()
      .from(goalMetrics)
      .where(and(eq(goalMetrics.goalId, goalId), eq(goalMetrics.active, true)));
  }

  async setMetricCurrent(goalId: string, key: string, current: number): Promise<void> {
    const goal = await this.getById(goalId);
    if (!goal || goal.deletedAt) throw new GoalValidationError('metrics', 'invalid');
    const metric = goal.metrics.find((metric) => metric.key === key);
    if (!metric || metric.source !== 'manual') throw new GoalValidationError(key, 'invalid');
    await this.update(goalId, {
      metrics: goal.metrics.map((metric) => ({
        key: metric.key,
        target: metric.target,
        current: metric.key === key ? current : metric.current,
        weight: metric.weight,
        source: metric.source as 'manual' | 'focus',
      })),
    });
  }

  private validateGoal(
    input: {
      title: string;
      progressMethod?: string;
      targetValue?: number | null;
      currentValue?: number | null;
      startDate?: number | null;
      deadline?: number | null;
    },
    type: GoalType,
    metrics: MetricInput[],
  ) {
    if (!input.title.trim()) throw new GoalValidationError('title', 'required');
    if (!GOAL_TYPES.includes(type)) throw new GoalValidationError('type', 'invalid');
    validateMetrics(type, metrics);
    if (type === 'custom' && input.progressMethod === 'metrics')
      throw new GoalValidationError('method', 'invalid');
    if (
      type === 'custom' &&
      input.progressMethod === 'numeric' &&
      (!Number.isFinite(input.targetValue) || (input.targetValue ?? 0) <= 0)
    )
      throw new GoalValidationError('target', 'positive');
    if (
      input.currentValue != null &&
      (!Number.isFinite(input.currentValue) || input.currentValue < 0)
    )
      throw new GoalValidationError('current', 'nonnegative');
    if (input.startDate != null && !Number.isFinite(input.startDate))
      throw new GoalValidationError('start', 'invalid');
    if (
      input.deadline != null &&
      (!Number.isFinite(input.deadline) ||
        (input.startDate != null && input.deadline < input.startDate))
    )
      throw new GoalValidationError('deadline', 'dates');
  }

  private async writeMetrics(goalId: string, metrics: MetricInput[]) {
    const now = nowMs();
    await this.db
      .update(goalMetrics)
      .set({ active: false, updatedAt: now })
      .where(eq(goalMetrics.goalId, goalId));
    for (const input of metrics) {
      const metric = { ...input, weight: 100 / metrics.length };
      await this.db
        .insert(goalMetrics)
        .values({ ...metric, goalId, id: newId(), active: true, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [goalMetrics.goalId, goalMetrics.key],
          set: { ...metric, active: true, updatedAt: now },
        });
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.db.update(goals).set({ deletedAt: nowMs() }).where(eq(goals.id, id));
  }

  async archive(id: string): Promise<void> {
    await this.db
      .update(goals)
      .set({ archivedAt: nowMs(), updatedAt: nowMs() })
      .where(eq(goals.id, id));
  }
}
