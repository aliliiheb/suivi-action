/** Subtask repository (spec §11). */
import { and, asc, eq, max } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { subtasks } from '../schema';
import { newId } from '@/shared/lib/id';
import { nowMs } from '@/shared/lib/time';

export type Subtask = InferSelectModel<typeof subtasks>;

export class SubtaskRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByTask(taskId: string): Promise<Subtask[]> {
    return this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.sortOrder));
  }

  async create(input: { taskId: string; title: string }): Promise<string> {
    const now = nowMs();
    const id = newId();
    const rows = await this.db
      .select({ value: max(subtasks.sortOrder) })
      .from(subtasks)
      .where(eq(subtasks.taskId, input.taskId));
    const nextOrder = (rows[0]?.value ?? -1) + 1;
    await this.db.insert(subtasks).values({
      id,
      taskId: input.taskId,
      title: input.title.trim(),
      completed: false,
      sortOrder: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async setCompleted(id: string, completed: boolean): Promise<void> {
    const now = nowMs();
    await this.db
      .update(subtasks)
      .set({ completed, completedAt: completed ? now : null, updatedAt: now })
      .where(and(eq(subtasks.id, id)));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(subtasks).where(eq(subtasks.id, id));
  }
}
