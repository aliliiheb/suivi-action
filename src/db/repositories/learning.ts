import { eq, like } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { settings } from '../schema';
import { newId } from '@/shared/lib/id';

export const LEARNING_KINDS = [
  'paths',
  'books',
  'courses',
  'skills',
  'projects',
  'certifications',
] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];
export interface LearningItem {
  id: string;
  kind: LearningKind;
  title: string;
  notes: string;
  url: string;
  current: number;
  target: number;
  updatedAt: number;
}
type LearningInput = Omit<LearningItem, 'id' | 'updatedAt'>;
const prefix = 'learning.v1.';

/** Namespaced records in the existing settings table travel with SQLite/JSON backups. */
export class LearningRepository {
  constructor(private readonly db: AppDatabase) {}
  async list(): Promise<LearningItem[]> {
    return this.db
      .select()
      .from(settings)
      .where(like(settings.key, `${prefix}%`))
      .all()
      .map((row) => JSON.parse(row.value) as LearningItem)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async save(input: LearningInput, id = newId()): Promise<string> {
    if (
      !LEARNING_KINDS.includes(input.kind) ||
      !input.title.trim() ||
      input.title.length > 200 ||
      !Number.isFinite(input.current) ||
      !Number.isFinite(input.target) ||
      input.current < 0 ||
      input.target <= 0 ||
      input.current > input.target
    ) {
      throw new Error('Invalid learning resource');
    }
    if (input.url && !['https:', 'http:'].includes(new URL(input.url).protocol))
      throw new Error('Invalid URL');
    const updatedAt = Date.now();
    const value = JSON.stringify({ ...input, title: input.title.trim(), id, updatedAt });
    this.db
      .insert(settings)
      .values({ key: prefix + id, value, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
      .run();
    return id;
  }
  async remove(id: string): Promise<void> {
    this.db
      .delete(settings)
      .where(eq(settings.key, prefix + id))
      .run();
  }
}
