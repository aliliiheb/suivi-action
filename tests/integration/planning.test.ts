import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsDatabase, type SqlJsHandle } from '@/db/drivers/sqljs';
import { TaskRepository } from '@/db/repositories/tasks';
import { PlanningRepository } from '@/db/repositories/planning';
import { addDaysMs, dayKey, startOfDayMs } from '@/shared/lib/time';
import { summarizeDay } from '@/domain/planning/daySummary';

let handle: SqlJsHandle;
let tasks: TaskRepository;
let planning: PlanningRepository;
beforeEach(async () => {
  handle = await createSqlJsDatabase();
  tasks = new TaskRepository(handle.db);
  planning = new PlanningRepository(handle.db);
});

describe('Daily planning', () => {
  it('limits priorities to three and allows replacing one', async () => {
    const ids = [];
    for (let i = 0; i < 4; i++)
      ids.push(await tasks.create({ title: `Task ${i}`, plannedDate: startOfDayMs() }));
    for (const id of ids.slice(0, 3)) await planning.togglePriority(id);
    await expect(planning.togglePriority(ids[3]!)).rejects.toThrow('Top 3');
    await planning.togglePriority(ids[1]!);
    await planning.togglePriority(ids[3]!);
    expect(await planning.listPriorities()).toEqual([ids[0], ids[3], ids[2]]);
  });
  it('keeps capacity and top three after closing and reopening the database', async () => {
    const id = await tasks.create({ title: 'Study', plannedDate: startOfDayMs() });
    await planning.togglePriority(id);
    await planning.setCapacity(dayKey(), 120);
    const bytes = handle.export();
    handle.raw.close();
    const restored = await createSqlJsDatabase(bytes);
    const repo = new PlanningRepository(restored.db);
    expect(await repo.getCapacity()).toBe(120);
    expect(await repo.listPriorities()).toEqual([id]);
  });
  it('removes a rescheduled task from priorities without losing its deadline', async () => {
    const deadline = addDaysMs(7);
    const id = await tasks.create({ title: 'Study', plannedDate: startOfDayMs(), deadline });
    await planning.togglePriority(id);
    await tasks.setPlannedDate(id, addDaysMs(1));
    expect(await planning.listPriorities()).toEqual([]);
    expect((await tasks.getById(id))?.deadline).toBe(deadline);
  });
  it('detects an expired deadline even without a planned date', async () => {
    const id = await tasks.create({ title: 'Deadline', deadline: addDaysMs(-1) });
    expect((await tasks.listOverdue(startOfDayMs())).map((task) => task.id)).toContain(id);
  });
  it('restores an unplanned capture to Inbox when completion is undone', async () => {
    const id = await tasks.createInbox('Idea');
    await tasks.setCompleted(id, true);
    await tasks.setCompleted(id, false);
    expect((await tasks.listInbox()).map((task) => task.id)).toContain(id);
  });
  it('does not reopen a completed task merely by changing its planned date', async () => {
    const id = await tasks.createInbox('Idea');
    await tasks.setCompleted(id, true);
    await tasks.setPlannedDate(id, startOfDayMs());
    expect((await tasks.getById(id))?.status).toBe('done');
  });
  it('rejects invalid estimates and calculates an honest workload', async () => {
    await expect(tasks.create({ title: 'Bad', estimatedMin: -1 })).rejects.toThrow();
    expect(
      summarizeDay(
        [
          { completed: true, estimatedMin: 90 },
          { completed: false, estimatedMin: null },
          { completed: false, estimatedMin: 60 },
        ],
        120,
      ),
    ).toMatchObject({ done: 1, total: 3, plannedMin: 150, unestimated: 1, overloaded: true });
  });
});
