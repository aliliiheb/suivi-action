import { describe, expect, it } from 'vitest';
import { createSqlJsDatabase } from '@/db/drivers/sqljs';
import { SpiritualRepository } from '@/db/repositories/spiritual';
import { exportJson, prepareRestore } from '@/db/backup';
import adhkar from '@/features/spiritual/data/adhkar.json';
import { readFileSync } from 'node:fs';

describe('Quran and adhkar', () => {
  it('ships all 114 surahs and 6236 uniquely numbered verses from the provider', () => {
    const data = JSON.parse(readFileSync('public/quran-uthmani.json', 'utf8'));
    expect(data.code).toBe(200);
    expect(data.data.surahs).toHaveLength(114);
    const verses = data.data.surahs.flatMap(
      (s: { ayahs: { number: number; text: string }[] }) => s.ayahs,
    );
    expect(verses).toHaveLength(6236);
    expect(new Set(verses.map((a: { number: number }) => a.number)).size).toBe(6236);
    expect(verses.every((a: { text: string }) => typeof a.text === 'string' && a.text.trim())).toBe(
      true,
    );
  });
  it('imports multiline adhkar without inventing unspecified repetition counts', () => {
    expect(adhkar).toHaveLength(345);
    expect(new Set(adhkar.map((item) => item.id)).size).toBe(345);
    expect(adhkar[0]?.text).toContain('\n');
    expect(adhkar.some((item) => item.count === '')).toBe(true);
    expect(
      adhkar.every(
        (item) => !item.count || (Number.isInteger(Number(item.count)) && Number(item.count) > 0),
      ),
    ).toBe(true);
  });
  it('restores the reading bookmark and daily counters through existing backups', async () => {
    const db = await createSqlJsDatabase();
    const repo = new SpiritualRepository(db.db);
    await repo.write('bookmark', { surah: 2, ayah: 255 });
    await repo.write('adhkar-2026-09-12', { 'azkar-1': 1, 'azkar-2': 2 });
    for (const source of [db.export(), JSON.stringify(exportJson(db))]) {
      const restored = await prepareRestore(source);
      const opened = await createSqlJsDatabase(restored.bytes);
      const r = new SpiritualRepository(opened.db);
      expect(await r.read('bookmark', null)).toEqual({ surah: 2, ayah: 255 });
      expect(await r.read('adhkar-2026-09-12', {})).toEqual({ 'azkar-1': 1, 'azkar-2': 2 });
      expect(await r.read('adhkar-2026-09-13', {})).toEqual({});
      opened.raw.close();
    }
    db.raw.close();
  });
});
