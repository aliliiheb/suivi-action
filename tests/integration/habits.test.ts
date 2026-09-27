import { expect, it } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { HabitRepository } from '@/db/repositories/habits';
import { dayKey } from '@/shared/lib/time';

it('updates one daily log, persists it, and recalculates statistics on deletion', async () => {
  const handle = await createSqlJsDatabase();
  const repo = new HabitRepository(handle.db);
  await repo.save({
    title: 'Read',
    tracking: 'duration',
    targetValue: 20,
    frequency: 'daily',
    daysOfWeek: null,
  });
  const habit = (await repo.list())[0]!;
  await repo.log(habit.id, dayKey(), 10);
  await repo.log(habit.id, dayKey(), 30);
  expect(await repo.logs(habit.id)).toHaveLength(1);
  expect((await repo.summary())[0]?.stats.current).toBe(1);
  const restored = await createSqlJsDatabase(handle.export());
  const restoredRepo = new HabitRepository(restored.db);
  expect((await restoredRepo.summary())[0]?.value).toBe(30);
  await restoredRepo.log(habit.id, dayKey(), 0);
  expect((await restoredRepo.summary())[0]?.stats.current).toBe(0);
});
