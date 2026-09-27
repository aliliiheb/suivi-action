import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsDatabase, type SqlJsHandle } from '@/db/drivers/sqljs';
import { GoalRepository } from '@/db/repositories/goals';
import { TaskRepository } from '@/db/repositories/tasks';
import { FocusRepository } from '@/db/repositories/focus';
import { GOAL_METRICS, GOAL_TYPES, type MetricInput } from '@/domain/goals/goalTypes';
import { dayKey } from '@/shared/lib/time';
import { exportJson, prepareRestore } from '@/db/backup';
import { MIGRATIONS } from '@/db/migrations';

let handle: SqlJsHandle;
let repo: GoalRepository;
const ayat = (current = 0): MetricInput => ({
  key: 'quran_ayat',
  target: 100,
  current,
  weight: 100,
  source: 'manual',
});
beforeEach(async () => {
  handle = await createSqlJsDatabase();
  repo = new GoalRepository(handle.db);
});

describe('Typed goals', () => {
  it('tracks Quran ayat and propagates corrections through cached progression', async () => {
    const id = await repo.create({ title: 'Memorize', goalType: 'quran', metrics: [ayat(20)] });
    expect(await repo.getById(id)).toMatchObject({
      goalType: 'quran',
      progressMethod: 'metrics',
      progress: 20,
    });
    await repo.setMetricCurrent(id, 'quran_ayat', 50);
    expect((await repo.getById(id))?.progress).toBe(50);
    await repo.setMetricCurrent(id, 'quran_ayat', 10);
    expect((await repo.getById(id))?.progress).toBe(10);
    expect((await repo.list())[0]?.metrics[0]?.current).toBe(10);
  });
  it('averages sport sessions and kilometres equally and caps each contribution', async () => {
    const id = await repo.create({
      title: 'Run',
      goalType: 'sport',
      metrics: [
        { key: 'sport_sessions', target: 10, current: 5, source: 'manual' },
        { key: 'sport_km', target: 100, current: 20, source: 'manual' },
      ],
    });
    expect((await repo.getById(id))?.progress).toBe(35);
    await repo.setMetricCurrent(id, 'sport_km', 200);
    expect((await repo.getById(id))?.progress).toBe(75);
    await repo.setMetricCurrent(id, 'sport_sessions', 10);
    expect((await repo.getById(id))?.progress).toBe(100);
  });
  it('supports decimal hours and synchronizes optional automatic Focus hours without duplication', async () => {
    const id = await repo.create({
      title: 'Study',
      goalType: 'study',
      metrics: [{ key: 'study_hours', target: 2, current: 0, weight: 100, source: 'focus' }],
    });
    const taskId = await new TaskRepository(handle.db).create({ title: 'Read', goalId: id });
    const focus = new FocusRepository(handle.db);
    await focus.addManual(taskId, 30, dayKey(), '');
    expect((await repo.getById(id))?.progress).toBe(25);
    await repo.update(id, { title: 'Study renamed' });
    expect((await repo.getById(id))?.metrics[0]?.current).toBe(0.5);
    await expect(repo.setMetricCurrent(id, 'study_hours', 10)).rejects.toThrow();
    await focus.addManual(taskId, 60, dayKey(), '');
    expect((await repo.getById(id))?.progress).toBe(75);
  });
  it('converts old unequal weights to equal measures when opening or restoring backups', async () => {
    const old = await createSqlJsDatabase(undefined, false);
    old.raw.run('CREATE TABLE __migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    for (const migration of MIGRATIONS.slice(0, 4)) {
      old.raw.run(migration.sql);
      old.raw.run('INSERT INTO __migrations VALUES (?, ?)', [migration.name, 1]);
    }
    const id = await new GoalRepository(old.db).create({
      title: 'Legacy sport',
      goalType: 'sport',
      metrics: [
        { key: 'sport_sessions', target: 10, current: 5, source: 'manual' },
        { key: 'sport_km', target: 100, current: 20, source: 'manual' },
      ],
    });
    old.raw.run(
      "UPDATE goal_metrics SET weight = CASE key WHEN 'sport_sessions' THEN 25 ELSE 75 END",
    );
    old.raw.run('UPDATE goals SET progress = 27.5');
    const bytes = old.export();
    const json = JSON.stringify(exportJson(old));
    for (const input of [
      bytes,
      (await prepareRestore(bytes)).bytes,
      (await prepareRestore(json)).bytes,
    ]) {
      const reopened = await createSqlJsDatabase(input);
      const goal = await new GoalRepository(reopened.db).getById(id);
      expect(goal?.progress).toBe(35);
      expect(goal?.metrics.map((metric) => metric.weight)).toEqual([50, 50]);
      expect(goal?.metrics.find((metric) => metric.key === 'sport_sessions')?.current).toBe(5);
      reopened.raw.close();
    }
    old.raw.close();
  });
  it('validates targets, count precision, type compatibility, negative totals and weights before writing', async () => {
    for (const invalid of [
      { ...ayat(), target: 0 },
      { ...ayat(), target: 1.5 },
      { ...ayat(), current: -1 },
      { ...ayat(), current: 2.5 },
      { ...ayat(), weight: -1 },
      { ...ayat(), key: 'sport_km' },
      { ...ayat(), source: 'focus' as const },
    ]) {
      await expect(
        repo.create({ title: 'Invalid', goalType: 'quran', metrics: [invalid] }),
      ).rejects.toThrow();
    }
    expect(await repo.list()).toHaveLength(0);
    const id = await repo.create({ title: 'Valid', goalType: 'quran', metrics: [ayat(20)] });
    await expect(repo.update(id, { metrics: [{ ...ayat(), target: 0 }] })).rejects.toThrow();
    expect((await repo.getById(id))?.progress).toBe(20);
  });
  it('persists typed measurements and restores their SQLite and JSON backups', async () => {
    const id = await repo.create({ title: 'Quran', goalType: 'quran', metrics: [ayat(40)] });
    for (const input of [handle.export(), JSON.stringify(exportJson(handle))]) {
      const restored = await createSqlJsDatabase((await prepareRestore(input)).bytes);
      expect(await new GoalRepository(restored.db).getById(id)).toMatchObject({
        goalType: 'quran',
        progress: 40,
        metrics: [expect.objectContaining({ current: 40, target: 100 })],
      });
      restored.raw.close();
    }
  });
  it('migrates old SQLite goals without changing their data', async () => {
    const old = await createSqlJsDatabase(undefined, false);
    old.raw.run('CREATE TABLE __migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    for (const migration of MIGRATIONS.slice(0, 3)) {
      old.raw.run(migration.sql);
      old.raw.run('INSERT INTO __migrations VALUES (?, ?)', [migration.name, 1]);
    }
    old.raw.run(
      "INSERT INTO goals(id,title,progress_method,manual_progress,progress,created_at,updated_at) VALUES ('legacy','Existing','manual',51,51,1,1)",
    );
    const restored = await createSqlJsDatabase((await prepareRestore(old.export())).bytes);
    expect(await new GoalRepository(restored.db).getById('legacy')).toMatchObject({
      goalType: 'custom',
      progressMethod: 'manual',
      manualProgress: 51,
      progress: 51,
      metrics: [],
    });
    old.raw.close();
    restored.raw.close();
  });
  it('imports JSON backups made before goal types existed', async () => {
    const id = await repo.create({ title: 'Legacy' });
    const json = exportJson(handle);
    delete json.tables.goal_metrics;
    for (const row of json.tables.goals ?? []) delete row.goal_type;
    const restored = await createSqlJsDatabase((await prepareRestore(JSON.stringify(json))).bytes);
    expect((await new GoalRepository(restored.db).getById(id))?.goalType).toBe('custom');
    restored.raw.close();
  });
  it('retains old metric rows when changing type and keeps tasks attached', async () => {
    const id = await repo.create({ title: 'Goal', goalType: 'quran', metrics: [ayat(25)] });
    const tasks = new TaskRepository(handle.db);
    const taskId = await tasks.create({ title: 'Task', goalId: id });
    await repo.update(id, {
      goalType: 'study',
      metrics: [{ key: 'study_hours', target: 10, current: 2.5, weight: 100, source: 'manual' }],
    });
    expect((await repo.getById(id))?.progress).toBe(25);
    expect((await tasks.getById(taskId))?.goalId).toBe(id);
    expect(exportJson(handle).tables.goal_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'quran_ayat', current: 25, active: 0 }),
      ]),
    );
  });
  it('creates every suggested type with its required measure', async () => {
    for (const type of GOAL_TYPES.filter((type) => type !== 'custom')) {
      const required = GOAL_METRICS[type].filter((metric) => metric.required);
      const id = await repo.create({
        title: type,
        goalType: type,
        metrics: required.map((metric) => ({
          key: metric.key,
          target: 10,
          current: 1,
          weight: 100 / required.length,
          source: 'manual',
        })),
      });
      expect((await repo.getById(id))?.progress).toBe(10);
    }
  });
});
