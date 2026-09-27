import { atomic } from '../transaction';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { habits, habitLogs } from '../schema';
import type { HabitTracking } from '@/domain/enums';
import { dayKey, nowMs } from '@/shared/lib/time';
import { newId } from '@/shared/lib/id';
import { habitStatistics, isHabitDay } from '@/domain/habits/statistics';

export type Habit = InferSelectModel<typeof habits>;
export type HabitLog = InferSelectModel<typeof habitLogs>;
export type HabitInput = {
  title: string;
  description?: string | null;
  areaId?: string | null;
  goalId?: string | null;
  tracking: HabitTracking;
  targetValue: number;
  unit?: string | null;
  frequency: string;
  daysOfWeek: string | null;
};

export class HabitRepository {
  constructor(private readonly db: AppDatabase) {}
  async list(): Promise<Habit[]> {
    return this.db
      .select()
      .from(habits)
      .where(and(isNull(habits.deletedAt), isNull(habits.archivedAt)))
      .orderBy(asc(habits.createdAt))
      .all();
  }
  async logs(habitId: string): Promise<HabitLog[]> {
    return this.db
      .select()
      .from(habitLogs)
      .where(eq(habitLogs.habitId, habitId))
      .orderBy(asc(habitLogs.date))
      .all();
  }
  async save(input: HabitInput, id?: string): Promise<void> {
    if (!input.title.trim() || !Number.isFinite(input.targetValue) || input.targetValue <= 0)
      throw new Error('Invalid habit');
    if (!['daily', 'custom', 'weekly'].includes(input.frequency))
      throw new Error('Invalid frequency');
    if (input.frequency !== 'daily') {
      const days = JSON.parse(input.daysOfWeek ?? '[]') as number[];
      if (
        !Array.isArray(days) ||
        !days.length ||
        days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      )
        throw new Error('Invalid days');
    }
    const values = { ...input, title: input.title.trim(), updatedAt: nowMs() };
    if (id) this.db.update(habits).set(values).where(eq(habits.id, id)).run();
    else
      this.db
        .insert(habits)
        .values({ ...values, id: newId(), createdAt: nowMs() })
        .run();
  }
  async log(habitId: string, date: string, value: number): Promise<void> {
    const habit = this.db.select().from(habits).where(eq(habits.id, habitId)).get();
    if (
      !habit ||
      habit.deletedAt ||
      !isHabitDay(habit, date) ||
      date > dayKey() ||
      !Number.isFinite(value) ||
      value < 0
    )
      throw new Error('Invalid habit log');
    atomic(this.db, (tx) => {
      tx.delete(habitLogs)
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
        .run();
      if (value > 0)
        tx.insert(habitLogs)
          .values({
            id: newId(),
            habitId,
            date,
            value: habit.tracking === 'boolean' ? 1 : value,
            createdAt: nowMs(),
          })
          .run();
    });
  }
  async setActive(id: string, active: boolean): Promise<void> {
    this.db.update(habits).set({ active, updatedAt: nowMs() }).where(eq(habits.id, id)).run();
  }
  async remove(id: string): Promise<void> {
    this.db
      .update(habits)
      .set({ deletedAt: nowMs(), updatedAt: nowMs() })
      .where(eq(habits.id, id))
      .run();
  }
  async summary(date = dayKey()) {
    const rows = await this.list();
    return Promise.all(
      rows.map(async (habit) => {
        const logs = await this.logs(habit.id);
        return {
          habit,
          logs,
          stats: habitStatistics(habit, logs, date),
          value: logs.find((log) => log.date === date)?.value ?? 0,
        };
      }),
    );
  }
}
