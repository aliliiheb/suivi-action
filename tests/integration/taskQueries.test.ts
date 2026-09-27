import { describe, it, expect, beforeEach } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { TaskRepository } from '@/db/repositories/tasks';
import { lifeAreas, goals } from '@/db/schema';
import { startOfDayMs, endOfDayMs, addDaysMs } from '@/shared/lib/time';
import type { AppDatabase } from '@/db/drivers/sqljs';

let db: AppDatabase;
let repo: TaskRepository;

beforeEach(async () => {
  ({ db } = await createSqlJsDatabase());
  repo = new TaskRepository(db);
  await db.insert(lifeAreas).values({
    id: 'area',
    name: 'Apprentissage',
    color: '#22c55e',
    sortOrder: 0,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
  });
  await db.insert(goals).values({
    id: 'goal',
    title: 'Anglais C1',
    areaId: 'area',
    status: 'active',
    priority: 'p2',
    progressMethod: 'tasks',
    progress: 0,
    investedMin: 0,
    createdAt: 1,
    updatedAt: 1,
  });
});

describe('Task operational queries (§15, §17, §41)', () => {
  it('inbox lists only quick-capture items', async () => {
    await repo.createInbox('Contacter fournisseur');
    await repo.create({ title: 'Planned task', goalId: 'goal', plannedDate: startOfDayMs() });
    const inbox = await repo.listInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.title).toBe('Contacter fournisseur');
  });

  it("today's planned active tasks carry their goal/area context (§12)", async () => {
    await repo.create({ title: 'Apprendre 20 mots', goalId: 'goal', plannedDate: startOfDayMs() });
    const today = await repo.listPlannedActiveBetween(startOfDayMs(), endOfDayMs());
    expect(today).toHaveLength(1);
    expect(today[0]!.goalTitle).toBe('Anglais C1');
    expect(today[0]!.areaName).toBe('Apprentissage');
  });

  it('overdue lists tasks planned before today and not completed (§41)', async () => {
    await repo.create({ title: 'En retard', goalId: 'goal', plannedDate: addDaysMs(-2) });
    await repo.create({ title: "Aujourd'hui", goalId: 'goal', plannedDate: startOfDayMs() });
    const overdue = await repo.listOverdue(startOfDayMs());
    expect(overdue.map((t) => t.title)).toEqual(['En retard']);
  });

  it('a completed overdue task no longer appears as overdue', async () => {
    const id = await repo.create({ title: 'Old', goalId: 'goal', plannedDate: addDaysMs(-3) });
    await repo.setCompleted(id, true);
    expect(await repo.listOverdue(startOfDayMs())).toHaveLength(0);
    const done = await repo.listCompletedBetween(startOfDayMs(), endOfDayMs());
    expect(done).toHaveLength(1);
    expect(done[0]!.title).toBe('Old');
  });

  it('planForToday moves an inbox item onto today and out of the inbox', async () => {
    const id = await repo.createInbox('Idea');
    await repo.planForToday(id);
    expect(await repo.listInbox()).toHaveLength(0);
    const today = await repo.listPlannedActiveBetween(startOfDayMs(), endOfDayMs());
    expect(today.map((t) => t.title)).toContain('Idea');
  });
});
