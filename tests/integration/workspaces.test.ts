import { describe, it, expect } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { WorkspaceRepository } from '@/db/repositories/workspace';
import { exportJson, prepareRestore } from '@/db/backup';
describe('Personal workspace persistence', () => {
  it('preserves linked notes, profile visions and time slots through backup', async () => {
    const handle = await createSqlJsDatabase(),
      repo = new WorkspaceRepository(handle.db);
    const note = await repo.saveNote({
      title: 'Revision',
      body: 'Remember this idea',
      kind: 'note',
      folder: 'Learning',
      goalId: 'goal-1',
      url: 'https://example.com',
    });
    await repo.saveNote({ ...note, title: 'Updated revision' });
    const event = await repo.saveEvent({
      title: 'Study',
      date: '2026-09-13',
      start: '09:00',
      end: '10:00',
      category: 'learning',
    });
    await repo.write('profile', { name: 'Reader', intention: 'Learn', visions: { '3': 'Grow' } });
    const restored = await prepareRestore(JSON.stringify(exportJson(handle))),
      opened = await createSqlJsDatabase(restored.bytes),
      copy = new WorkspaceRepository(opened.db);
    expect((await copy.notes())[0]).toMatchObject({
      title: 'Updated revision',
      createdAt: note.createdAt,
      goalId: 'goal-1',
    });
    expect(await copy.events()).toEqual([event]);
    expect(await copy.read('profile', null)).toEqual({
      name: 'Reader',
      intention: 'Learn',
      visions: { '3': 'Grow' },
    });
    await copy.remove('note', note.id);
    expect(await copy.notes()).toEqual([]);
    expect(await copy.events()).toHaveLength(1);
    opened.raw.close();
    handle.raw.close();
  });
  it('rejects unsafe links, impossible dates and reversed times without corrupting records', async () => {
    const handle = await createSqlJsDatabase(),
      repo = new WorkspaceRepository(handle.db);
    await expect(
      repo.saveNote({
        title: 'Link',
        body: '',
        kind: 'link',
        folder: '',
        goalId: '',
        url: 'javascript:alert(1)',
      }),
    ).rejects.toThrow();
    for (const change of [
      { date: '2026-02-30' },
      { start: '25:00' },
      { end: '08:00' },
      { end: '09:00' },
    ])
      await expect(
        repo.saveEvent({
          title: 'Study',
          date: '2026-09-13',
          start: '09:00',
          end: '10:00',
          category: 'learning',
          ...change,
        }),
      ).rejects.toThrow();
    expect(await repo.notes()).toEqual([]);
    expect(await repo.events()).toEqual([]);
    handle.raw.close();
  });
});
