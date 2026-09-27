import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { settings } from '../schema';

/** Personal reading state is kept in SQLite and included in existing backups. */
export class SpiritualRepository {
  constructor(private readonly db: AppDatabase) {}
  async read<T>(key: string, fallback: T): Promise<T> {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, `spiritual.v1.${key}`))
      .get();
    return row ? (JSON.parse(row.value) as T) : fallback;
  }
  async write<T>(key: string, value: T): Promise<void> {
    const updatedAt = Date.now();
    const encoded = JSON.stringify(value);
    this.db
      .insert(settings)
      .values({ key: `spiritual.v1.${key}`, value: encoded, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: encoded, updatedAt } })
      .run();
  }
}
