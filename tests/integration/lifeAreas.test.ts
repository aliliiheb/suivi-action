import { describe, it, expect, beforeEach } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { LifeAreaRepository } from '@/db/repositories/lifeAreas';

async function makeRepo() {
  const { db } = await createSqlJsDatabase();
  return new LifeAreaRepository(db);
}

describe('LifeAreaRepository (§6, §43)', () => {
  let repo: LifeAreaRepository;
  beforeEach(async () => {
    repo = await makeRepo();
  });

  it('starts empty (no seed data, §71)', async () => {
    expect(await repo.list()).toEqual([]);
  });

  it('creates areas with incrementing sort order and trims the name', async () => {
    const a = await repo.create({ name: '  Apprentissage  ' });
    const b = await repo.create({ name: 'Santé' });
    expect(a.name).toBe('Apprentissage');
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(await repo.list()).toHaveLength(2);
  });

  it('updates fields', async () => {
    const a = await repo.create({ name: 'Sport' });
    await repo.update(a.id, { name: 'Fitness', color: '#22c55e' });
    const updated = await repo.getById(a.id);
    expect(updated?.name).toBe('Fitness');
    expect(updated?.color).toBe('#22c55e');
  });

  it('soft-deletes and restores (trash, §43)', async () => {
    const a = await repo.create({ name: 'Finances' });
    await repo.softDelete(a.id);
    expect(await repo.list()).toHaveLength(0);
    expect((await repo.getById(a.id))?.deletedAt).toBeTruthy();
    await repo.restore(a.id);
    expect(await repo.list()).toHaveLength(1);
  });

  it('archives and unarchives (§6)', async () => {
    const a = await repo.create({ name: 'Business' });
    await repo.archive(a.id);
    expect(await repo.list()).toHaveLength(0);
    expect(await repo.listArchived()).toHaveLength(1);
    await repo.unarchive(a.id);
    expect(await repo.list()).toHaveLength(1);
  });

  it('reorders areas', async () => {
    const a = await repo.create({ name: 'A' });
    const b = await repo.create({ name: 'B' });
    const c = await repo.create({ name: 'C' });
    await repo.reorder([c.id, a.id, b.id]);
    const ordered = (await repo.list()).map((x) => x.name);
    expect(ordered).toEqual(['C', 'A', 'B']);
  });
});
