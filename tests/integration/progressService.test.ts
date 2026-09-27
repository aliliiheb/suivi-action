import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createSqlJsDatabase, type AppDatabase } from '@/db/drivers/sqljs';
import { ProgressService } from '@/db/services/progressService';
import { lifeAreas, goals, goalSteps, tasks, subtasks } from '@/db/schema';

let db: AppDatabase;
let service: ProgressService;

const T = 1_000; // fixed timestamp for inserts

beforeEach(async () => {
  ({ db } = await createSqlJsDatabase());
  service = new ProgressService(db);
});

async function insertGoal(id: string, method = 'tasks', extra: Record<string, unknown> = {}) {
  await db.insert(lifeAreas).values({
    id: `area-${id}`,
    name: 'Apprentissage',
    sortOrder: 0,
    hidden: false,
    createdAt: T,
    updatedAt: T,
  });
  await db.insert(goals).values({
    id,
    title: 'Atteindre C1 en anglais',
    areaId: `area-${id}`,
    status: 'active',
    priority: 'p2',
    progressMethod: method,
    progress: 0,
    investedMin: 0,
    createdAt: T,
    updatedAt: T,
    ...extra,
  });
}

async function insertStep(id: string, goalId: string, weight = 1) {
  await db.insert(goalSteps).values({
    id,
    goalId,
    title: id,
    sortOrder: 0,
    status: 'active',
    weight,
    progress: 0,
    investedMin: 0,
    createdAt: T,
    updatedAt: T,
  });
}

async function insertTask(
  id: string,
  goalId: string,
  opts: { stepId?: string; completed?: boolean; weight?: number; spentMin?: number } = {},
) {
  await db.insert(tasks).values({
    id,
    title: id,
    goalId,
    stepId: opts.stepId ?? null,
    status: opts.completed ? 'done' : 'planned',
    priority: 'p3',
    weight: opts.weight ?? 1,
    spentMin: opts.spentMin ?? 0,
    completed: opts.completed ?? false,
    createdAt: T,
    updatedAt: T,
  });
}

describe('ProgressService — propagation Task → Step → Goal (§13, §75, §87)', () => {
  it('rolls up completed tasks into step and goal progress', async () => {
    await insertGoal('g1');
    await insertStep('B1', 'g1');
    await insertStep('B2', 'g1');
    await insertStep('C1', 'g1');
    // B1: 4 tasks, 2 completed → 50%
    await insertTask('t1', 'g1', { stepId: 'B1', completed: true });
    await insertTask('t2', 'g1', { stepId: 'B1', completed: true });
    await insertTask('t3', 'g1', { stepId: 'B1', completed: false });
    await insertTask('t4', 'g1', { stepId: 'B1', completed: false });

    await service.recomputeGoal('g1');

    const b1 = (await db.select().from(goalSteps).where(eq(goalSteps.id, 'B1')))[0]!;
    expect(b1.progress).toBe(50);

    // Goal = rollup of 3 equally-weighted steps = (50 + 0 + 0) / 3 = 16.67
    const g = (await db.select().from(goals).where(eq(goals.id, 'g1')))[0]!;
    expect(g.progress).toBeCloseTo(16.666, 2);
  });

  it('sums invested minutes up to the goal', async () => {
    await insertGoal('g2');
    await insertStep('S', 'g2');
    await insertTask('a', 'g2', { stepId: 'S', completed: true, spentMin: 36 });
    await insertTask('b', 'g2', { stepId: 'S', completed: false, spentMin: 12 });

    await service.recomputeGoal('g2');

    const step = (await db.select().from(goalSteps).where(eq(goalSteps.id, 'S')))[0]!;
    const goal = (await db.select().from(goals).where(eq(goals.id, 'g2')))[0]!;
    expect(step.investedMin).toBe(48);
    expect(goal.investedMin).toBe(48);
  });

  it('computes task progress from subtasks', async () => {
    await insertGoal('g3');
    await insertStep('S', 'g3');
    await insertTask('parent', 'g3', { stepId: 'S', completed: false });
    // 4 subtasks, 2 done → task = 50% → step = 50%
    for (let i = 0; i < 4; i += 1) {
      await db.insert(subtasks).values({
        id: `sub${i}`,
        taskId: 'parent',
        title: `sub${i}`,
        completed: i < 2,
        sortOrder: i,
        createdAt: T,
        updatedAt: T,
      });
    }
    await service.recomputeGoal('g3');
    const step = (await db.select().from(goalSteps).where(eq(goalSteps.id, 'S')))[0]!;
    expect(step.progress).toBe(50);
  });

  it('respects the numeric method (320 / 1000 → 32%)', async () => {
    await insertGoal('g4', 'numeric', { currentValue: 320, targetValue: 1000 });
    await service.recomputeGoal('g4');
    const goal = (await db.select().from(goals).where(eq(goals.id, 'g4')))[0]!;
    expect(goal.progress).toBe(32);
  });

  it('respects the manual method', async () => {
    await insertGoal('g5', 'manual', { manualProgress: 73 });
    await service.recomputeGoal('g5');
    const goal = (await db.select().from(goals).where(eq(goals.id, 'g5')))[0]!;
    expect(goal.progress).toBe(73);
  });

  it('excludes cancelled tasks from the denominator', async () => {
    await insertGoal('g6');
    await insertStep('S', 'g6');
    await insertTask('done', 'g6', { stepId: 'S', completed: true });
    await insertTask('open', 'g6', { stepId: 'S', completed: false });
    // a cancelled task should not drag progress down
    await db.insert(tasks).values({
      id: 'cx',
      title: 'cx',
      goalId: 'g6',
      stepId: 'S',
      status: 'cancelled',
      priority: 'p3',
      weight: 1,
      spentMin: 0,
      completed: false,
      createdAt: T,
      updatedAt: T,
    });
    await service.recomputeGoal('g6');
    const step = (await db.select().from(goalSteps).where(eq(goalSteps.id, 'S')))[0]!;
    expect(step.progress).toBe(50); // 1 of 2 countable tasks
  });
});
