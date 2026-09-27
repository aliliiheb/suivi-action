import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { lifeAreas, goals } from '@/db/schema';

describe('database + migrations (§73)', () => {
  it('applies all migrations and the schema is queryable', async () => {
    const { db } = await createSqlJsDatabase();
    const areas = await db.select().from(lifeAreas);
    expect(areas).toEqual([]); // real empty state, no seed data (§71)
  });

  it('persists data across an export/reopen cycle (simulates app restart, §81)', async () => {
    const a = await createSqlJsDatabase();
    await a.db.insert(lifeAreas).values({
      id: '01AREA',
      name: 'Apprentissage',
      sortOrder: 0,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await a.db.insert(goals).values({
      id: '01GOAL',
      title: 'Atteindre C1 en anglais',
      areaId: '01AREA',
      status: 'active',
      priority: 'p2',
      progressMethod: 'tasks',
      progress: 0,
      investedMin: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    const bytes = a.export();

    // Reopen from the exported bytes — migrations must NOT re-run, data survives.
    const b = await createSqlJsDatabase(bytes);
    const area = await b.db.select().from(lifeAreas).where(eq(lifeAreas.id, '01AREA'));
    expect(area).toHaveLength(1);
    expect(area[0]!.name).toBe('Apprentissage');

    const goal = await b.db.select().from(goals).where(eq(goals.areaId, '01AREA'));
    expect(goal).toHaveLength(1);
    expect(goal[0]!.title).toBe('Atteindre C1 en anglais');
  });

  it('enforces the foreign key from goal → life area', async () => {
    const { db } = await createSqlJsDatabase();
    await expect(
      db.insert(goals).values({
        id: '01BAD',
        title: 'Orphan goal',
        areaId: 'does-not-exist',
        status: 'draft',
        priority: 'p3',
        progressMethod: 'tasks',
        progress: 0,
        investedMin: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    ).rejects.toThrow();
  });
});
