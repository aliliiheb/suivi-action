import { describe, expect, it } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { HabitRepository } from '@/db/repositories/habits';
import { habitDashboard, habitDayCounts } from '@/domain/habits/dashboard';
import { SpiritualRepository } from '@/db/repositories/spiritual';
import { FocusRepository } from '@/db/repositories/focus';
import { TaskRepository } from '@/db/repositories/tasks';
import { exportJson, prepareRestore } from '@/db/backup';

describe('Illustrated daily workspaces', () => {
  it('uses scheduled habits and their targets, not goal percentages, for garden and calendar progress', async () => {
    const handle = await createSqlJsDatabase();
    const habits = new HabitRepository(handle.db);
    await habits.save({
      title: 'Reading',
      tracking: 'boolean',
      targetValue: 1,
      frequency: 'daily',
      daysOfWeek: null,
    });
    await habits.save({
      title: 'Practice',
      tracking: 'count',
      targetValue: 20,
      frequency: 'custom',
      daysOfWeek: '[1]',
    });
    const [reading, practice] = await habits.list();
    handle.raw.run('UPDATE habits SET created_at = ?', [new Date('2026-09-01T12:00:00').getTime()]);
    await habits.log(reading!.id, '2026-09-07', 1);
    await habits.log(practice!.id, '2026-09-07', 10);
    let rows = await habits.summary('2026-09-07');
    expect(habitDayCounts(rows, '2026-09-07')).toEqual({ due: 2, done: 1, percent: 50 });
    await habits.log(practice!.id, '2026-09-07', 20);
    rows = await habits.summary('2026-09-07');
    expect(habitDayCounts(rows, '2026-09-07')).toEqual({ due: 2, done: 2, percent: 100 });
    expect(habitDayCounts(rows, '2026-09-08').due).toBe(1);
    expect(habitDashboard(rows, '2026-09-07').weekly).toBe(25); // 7 daily opportunities + Monday practice.
    await habits.setActive(practice!.id, false);
    rows = await habits.summary('2026-09-07');
    expect(habitDayCounts(rows, '2026-09-07').due).toBe(1);
    expect(habitDayCounts(rows, '2026-08-31').due).toBe(0);
    handle.raw.close();
  });
  it('retains learned sunnahs, daily applications, bookmarks and reflections through backup without carrying daily marks into tomorrow', async () => {
    const handle = await createSqlJsDatabase();
    const repo = new SpiritualRepository(handle.db);
    await repo.write('sunnah.learned', ['duha']);
    await repo.write('sunnah.applied.2026-09-13', ['duha']);
    await repo.write('sunnah.bookmarks', ['intention']);
    await repo.write('sunnah.reflection.2026-09-13', 'Une intention attentive.');
    const restored = await prepareRestore(JSON.stringify(exportJson(handle)));
    const opened = await createSqlJsDatabase(restored.bytes);
    const state = new SpiritualRepository(opened.db);
    expect(await state.read('sunnah.learned', [])).toEqual(['duha']);
    expect(await state.read('sunnah.applied.2026-09-14', [])).toEqual([]);
    expect(await state.read('sunnah.applied.2026-09-13', [])).toEqual(['duha']);
    expect(await state.read('sunnah.bookmarks', [])).toEqual(['intention']);
    expect(await state.read('sunnah.reflection.2026-09-13', '')).toBe('Une intention attentive.');
    opened.raw.close();
    handle.raw.close();
  });
  it('counts all completed focus minutes for the selected local date and excludes another day and a running session', async () => {
    const handle = await createSqlJsDatabase();
    const focus = new FocusRepository(handle.db);
    const tasks = new TaskRepository(handle.db);
    const id = await tasks.create({ title: 'Focus task' });
    await focus.addManual(id, 25, '2026-09-12', '');
    await focus.addManual(id, 30, '2026-09-13', '');
    await focus.addManual(id, 10, '2026-09-13', '');
    await focus.start(id, null, new Date('2026-09-13T10:00:00').getTime());
    expect(await focus.durationForDay('2026-09-13')).toBe(40);
    expect(await focus.durationForDay('2026-09-12')).toBe(25);
    expect(await focus.durationForDay('2026-09-14')).toBe(0);
    handle.raw.close();
  });
});
