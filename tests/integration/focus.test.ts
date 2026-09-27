import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsDatabase, type SqlJsHandle } from '@/db/drivers/sqljs';
import { FocusRepository } from '@/db/repositories/focus';
import { TaskRepository } from '@/db/repositories/tasks';
import { GoalRepository } from '@/db/repositories/goals';
import { StepRepository } from '@/db/repositories/steps';

let handle: SqlJsHandle;
let focus: FocusRepository;
let tasks: TaskRepository;
let taskId: string;
let goalId: string;
const start = new Date('2026-09-11T10:00:00').getTime();
beforeEach(async () => {
  handle = await createSqlJsDatabase();
  focus = new FocusRepository(handle.db);
  tasks = new TaskRepository(handle.db);
  goalId = await new GoalRepository(handle.db).create({ title: 'English C1' });
  const stepId = await new StepRepository(handle.db).create({ goalId, title: 'B1' });
  taskId = await tasks.create({ title: 'Learn 20 words', goalId, stepId });
});

describe('Persistent focus timer', () => {
  it('excludes pauses, propagates 36 minutes and completion to the goal', async () => {
    await focus.start(taskId, null, start);
    await focus.setPaused(true, start + 20 * 60000);
    await focus.setPaused(false, start + 25 * 60000);
    await focus.stop('Worked on vocabulary', true, start + 41 * 60000);
    const [session] = await focus.history();
    expect(session?.durationMin).toBe(36);
    expect(session?.pausedMin).toBe(5);
    expect((await tasks.getById(taskId))?.spentMin).toBe(36);
    const goal = await new GoalRepository(handle.db).getById(goalId);
    expect(goal?.investedMin).toBe(36);
    expect(goal?.progress).toBe(100);
  });
  it('recovers saved work after reopening and does not count the absence', async () => {
    await focus.start(taskId, null, start);
    await focus.tick(start + 10 * 60000);
    const bytes = handle.export();
    handle.raw.close();
    handle = await createSqlJsDatabase(bytes);
    focus = new FocusRepository(handle.db);
    await focus.recover(start + 60 * 60000);
    expect(await focus.active()).toMatchObject({
      state: 'paused',
      elapsedMs: 10 * 60000,
      recovered: true,
    });
    await focus.setPaused(false, start + 61 * 60000);
    await focus.stop('', false, start + 66 * 60000);
    expect((await focus.history())[0]?.durationMin).toBe(15);
  });
  it('prevents simultaneous sessions and repeated stop from duplicating time', async () => {
    await focus.start(taskId, null, start);
    await expect(focus.start(taskId, null, start)).rejects.toThrow('already active');
    await focus.stop('', false, start + 60000);
    await focus.stop('', false, start + 120000);
    expect((await tasks.getById(taskId))?.spentMin).toBe(1);
    expect(await focus.history()).toHaveLength(1);
  });
  it('caps Pomodoro work at its target after a delayed tick', async () => {
    await focus.start(taskId, 25, start);
    await focus.tick(start + 35 * 60000);
    expect(await focus.active()).toMatchObject({ state: 'paused', elapsedMs: 25 * 60000 });
    await focus.stop('', false, start + 40 * 60000);
    expect((await focus.history())[0]?.durationMin).toBe(25);
  });
  it('validates manual time and includes it in task and goal totals', async () => {
    await expect(focus.addManual(taskId, -10, '2026-09-11', '')).rejects.toThrow();
    await focus.addManual(taskId, 15, '2026-09-11', 'Review');
    expect((await tasks.getById(taskId))?.spentMin).toBe(15);
    expect((await new GoalRepository(handle.db).getById(goalId))?.investedMin).toBe(15);
  });
});
