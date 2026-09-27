import { describe, expect, it } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { exportJson, exportCsv, prepareRestore } from '@/db/backup';
import { GoalRepository } from '@/db/repositories/goals';
import { TaskRepository } from '@/db/repositories/tasks';
import { FocusRepository } from '@/db/repositories/focus';
import { ReportsRepository } from '@/db/repositories/reports';
import { ArchiveRepository } from '@/db/repositories/archive';
import { ProgressService } from '@/db/services/progressService';
import { atomicAsync } from '@/db/transaction';
import { dayKey } from '@/shared/lib/time';

describe('Backup, restore and trash', () => {
  it('roundtrips JSON and SQLite with related goal/task/focus data', async () => {
    const handle = await createSqlJsDatabase();
    const goalId = await new GoalRepository(handle.db).create({ title: 'English' });
    const taskId = await new TaskRepository(handle.db).create({ title: 'Words', goalId });
    await new FocusRepository(handle.db).addManual(taskId, 36, dayKey(), 'Vocabulary');
    for (const source of [JSON.stringify(exportJson(handle)), handle.export()]) {
      const restored = await prepareRestore(source);
      expect(restored.count).toBeGreaterThanOrEqual(4);
      const opened = await createSqlJsDatabase(restored.bytes);
      expect((await new TaskRepository(opened.db).getById(taskId))?.spentMin).toBe(36);
      expect((await new GoalRepository(opened.db).getById(goalId))?.investedMin).toBe(36);
      opened.raw.close();
    }
  });
  it('rejects corrupted files, incompatible versions, orphaned records and invalid values', async () => {
    await expect(prepareRestore(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(prepareRestore('{bad')).rejects.toThrow();
    const handle = await createSqlJsDatabase();
    await new TaskRepository(handle.db).create({ title: 'Keep' });
    const json = exportJson(handle);
    await expect(prepareRestore(JSON.stringify({ ...json, version: 999 }))).rejects.toThrow();
    json.tables.tasks![0]!.goal_id = 'missing-goal';
    await expect(prepareRestore(JSON.stringify(json))).rejects.toThrow();
    json.tables.tasks![0]!.goal_id = null;
    json.tables.tasks![0]!.estimated_min = -10;
    await expect(prepareRestore(JSON.stringify(json))).rejects.toThrow();
  });
  it('keeps foreign keys enabled after export and escapes spreadsheet formulas', async () => {
    const handle = await createSqlJsDatabase();
    await new TaskRepository(handle.db).createInbox('=HYPERLINK("https://example.com")');
    const csv = exportCsv(handle, 'tasks');
    expect(csv).toContain("'=HYPERLINK");
    handle.export();
    expect(handle.raw.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]).toBe(1);
  });
  it('restores a deleted task and its deleted goal', async () => {
    const handle = await createSqlJsDatabase();
    const goals = new GoalRepository(handle.db),
      tasks = new TaskRepository(handle.db),
      archive = new ArchiveRepository(handle.db);
    const goalId = await goals.create({ title: 'Goal' });
    const taskId = await tasks.create({ title: 'Task', goalId });
    await tasks.softDelete(taskId);
    await goals.softDelete(goalId);
    expect(await archive.list()).toHaveLength(2);
    await archive.restore('tasks', taskId);
    expect(await archive.list()).toHaveLength(0);
    expect((await tasks.listActive()).map((task) => task.id)).toContain(taskId);
  });
  it('rolls back all related writes when a service operation fails', async () => {
    const handle = await createSqlJsDatabase();
    const tasks = new TaskRepository(handle.db);
    const id = await tasks.createInbox('Original');
    await expect(
      atomicAsync(handle.db, async () => {
        await tasks.setCompleted(id, true);
        throw new Error('Failure after completion');
      }),
    ).rejects.toThrow();
    expect((await tasks.getById(id))?.completed).toBe(false);
  });
  it('keeps historical focus time after a task is deleted', async () => {
    const handle = await createSqlJsDatabase();
    const goalId = await new GoalRepository(handle.db).create({ title: 'Goal' });
    const tasks = new TaskRepository(handle.db);
    const taskId = await tasks.create({ title: 'Task', goalId });
    await new FocusRepository(handle.db).addManual(taskId, 15, dayKey(), '');
    await tasks.softDelete(taskId);
    await new ProgressService(handle.db).recomputeGoal(goalId);
    expect((await new GoalRepository(handle.db).getById(goalId))?.investedMin).toBe(15);
  });
  it('reports real Focus data and reloads saved reviews', async () => {
    const handle = await createSqlJsDatabase();
    const tasks = new TaskRepository(handle.db),
      reports = new ReportsRepository(handle.db);
    const id = await tasks.createInbox('Work');
    await new FocusRepository(handle.db).addManual(id, 30, dayKey(), '');
    await tasks.setCompleted(id, true);
    const report = await reports.report(dayKey(), dayKey());
    expect(report.minutes).toBe(30);
    expect(report.completed).toHaveLength(1);
    expect(report.regularity).toBe(100);
    const answers = { wentWell: 'Good focus', blocked: '', toImprove: '', nextPriorities: 'Read' };
    await reports.saveReview('weekly', dayKey(), answers, {
      minutes: 30,
      completed: 1,
      regularity: 100,
    });
    expect(await reports.review('weekly', dayKey())).toMatchObject(answers);
    await reports.saveReview('monthly', dayKey(), answers, {
      minutes: 30,
      completed: 1,
      regularity: 100,
    });
    expect(await reports.review('monthly', dayKey())).toMatchObject({
      notes: JSON.stringify(answers),
    });
  });
});
