import { describe, it, expect } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { LearningRepository } from '@/db/repositories/learning';
import { exportJson, prepareRestore } from '@/db/backup';

describe('Learning resources', () => {
  it('preserves resources and edits across SQLite and JSON backup restoration', async () => {
    const handle = await createSqlJsDatabase();
    const repo = new LearningRepository(handle.db);
    const input = {
      kind: 'books' as const,
      title: 'My book',
      notes: 'Keep this note',
      url: 'https://example.com',
      current: 20,
      target: 200,
    };
    const id = await repo.save(input);
    await repo.save({ ...input, current: 80 }, id);
    for (const source of [handle.export(), JSON.stringify(exportJson(handle))]) {
      const restored = await prepareRestore(source);
      const opened = await createSqlJsDatabase(restored.bytes);
      const restoredRepo = new LearningRepository(opened.db);
      expect(await restoredRepo.list()).toMatchObject([
        { id, current: 80, notes: 'Keep this note' },
      ]);
      await restoredRepo.remove(id);
      expect(await restoredRepo.list()).toEqual([]);
      opened.raw.close();
    }
    handle.raw.close();
  });
  it('rejects invalid progression and unsafe links without replacing saved content', async () => {
    const handle = await createSqlJsDatabase();
    const repo = new LearningRepository(handle.db);
    const input = {
      kind: 'courses' as const,
      title: 'Course',
      notes: '',
      url: '',
      current: 0,
      target: 10,
    };
    const id = await repo.save(input);
    for (const change of [
      { target: 0 },
      { current: -1 },
      { current: 11 },
      { current: NaN },
      { title: '  ' },
      { url: 'javascript:alert(1)' },
    ]) {
      await expect(repo.save({ ...input, ...change }, id)).rejects.toThrow();
    }
    expect(await repo.list()).toMatchObject([{ title: 'Course', current: 0, target: 10 }]);
    handle.raw.close();
  });
});

