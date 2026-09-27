/** Goal-step repository (spec §9). */
import { and, asc, eq, isNull, max } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { goalSteps } from '../schema';
import { newId } from '@/shared/lib/id';
import { nowMs } from '@/shared/lib/time';
import type { StepStatus } from '@/domain/enums';

export type GoalStep = InferSelectModel<typeof goalSteps>;

export class StepRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByGoal(goalId: string): Promise<GoalStep[]> {
    return this.db
      .select()
      .from(goalSteps)
      .where(and(eq(goalSteps.goalId, goalId), isNull(goalSteps.deletedAt)))
      .orderBy(asc(goalSteps.sortOrder));
  }

  async create(input: { goalId: string; title: string; weight?: number }): Promise<string> {
    const now = nowMs();
    const id = newId();
    const rows = await this.db
      .select({ value: max(goalSteps.sortOrder) })
      .from(goalSteps)
      .where(eq(goalSteps.goalId, input.goalId));
    const nextOrder = (rows[0]?.value ?? -1) + 1;
    await this.db.insert(goalSteps).values({
      id,
      goalId: input.goalId,
      title: input.title.trim(),
      sortOrder: nextOrder,
      status: 'active',
      weight: input.weight ?? 1,
      progress: 0,
      investedMin: 0,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async update(
    id: string,
    patch: { title?: string; weight?: number; status?: StepStatus },
  ): Promise<void> {
    const next: Record<string, unknown> = { updatedAt: nowMs() };
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.weight !== undefined) next.weight = patch.weight;
    if (patch.status !== undefined) next.status = patch.status;
    await this.db.update(goalSteps).set(next).where(eq(goalSteps.id, id));
  }

  async softDelete(id: string): Promise<void> {
    await this.db.update(goalSteps).set({ deletedAt: nowMs() }).where(eq(goalSteps.id, id));
  }
}
