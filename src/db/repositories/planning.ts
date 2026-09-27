import { atomic } from '../transaction';
import { and, asc, eq, isNull, notInArray } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { dailyPlans, dailyPriorities, tasks } from '../schema';
import { newId } from '@/shared/lib/id';
import { dayKey, nowMs, startOfDayMs, endOfDayMs } from '@/shared/lib/time';

export class PlanningRepository {
  constructor(private readonly db: AppDatabase) {}

  async getCapacity(date = dayKey()): Promise<number> {
    return (
      this.db.select().from(dailyPlans).where(eq(dailyPlans.date, date)).get()?.capacityMin ?? 480
    );
  }

  async setCapacity(date: string, capacityMin: number): Promise<void> {
    if (!Number.isInteger(capacityMin) || capacityMin < 0 || capacityMin > 1440)
      throw new Error('Invalid capacity');
    const now = nowMs();
    this.db
      .insert(dailyPlans)
      .values({ id: newId(), date, capacityMin, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: dailyPlans.date, set: { capacityMin, updatedAt: now } })
      .run();
  }

  async listPriorities(date = dayKey()): Promise<string[]> {
    return this.db
      .select({ id: tasks.id })
      .from(dailyPriorities)
      .innerJoin(tasks, eq(tasks.id, dailyPriorities.taskId))
      .where(
        and(
          eq(dailyPriorities.date, date),
          isNull(tasks.deletedAt),
          notInArray(tasks.status, ['cancelled', 'archived']),
        ),
      )
      .orderBy(asc(dailyPriorities.rank))
      .all()
      .map((row) => row.id);
  }

  /** Synchronous SQLite transaction prevents two rapid clicks exceeding Top 3. */
  async togglePriority(taskId: string, date = dayKey()): Promise<void> {
    atomic(this.db, (tx) => {
      const task = tx.select().from(tasks).where(eq(tasks.id, taskId)).get();
      if (!task || task.deletedAt || ['cancelled', 'archived'].includes(task.status))
        throw new Error('Unavailable task');
      const rows = tx
        .select()
        .from(dailyPriorities)
        .where(eq(dailyPriorities.date, date))
        .orderBy(asc(dailyPriorities.rank))
        .all();
      const existing = rows.find((row) => row.taskId === taskId);
      if (existing) {
        tx.delete(dailyPriorities).where(eq(dailyPriorities.id, existing.id)).run();
        return;
      }
      const alive = rows.filter((row) => {
        const item = tx.select().from(tasks).where(eq(tasks.id, row.taskId)).get();
        return item && !item.deletedAt && !['cancelled', 'archived'].includes(item.status);
      });
      for (const row of rows.filter((row) => !alive.includes(row)))
        tx.delete(dailyPriorities).where(eq(dailyPriorities.id, row.id)).run();
      if (alive.length >= 3) throw new Error('Top 3 is full');
      const start = startOfDayMs(new Date(`${date}T12:00:00`));
      if (
        task.plannedDate === null ||
        task.plannedDate < start ||
        task.plannedDate > endOfDayMs(start)
      )
        throw new Error('Task must be planned on this day');
      const rank = [1, 2, 3].find((rank) => !alive.some((row) => row.rank === rank))!;
      tx.insert(dailyPriorities)
        .values({ id: newId(), date, taskId, rank, createdAt: nowMs() })
        .run();
    });
  }
}
