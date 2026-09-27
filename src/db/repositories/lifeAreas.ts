/**
 * Life area repository (spec §6). Encapsulates all DB access for life areas:
 * CRUD, reordering, archive/restore, soft-delete (trash, §43). No UI or business
 * rules here — pure persistence over the Drizzle client.
 */
import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { lifeAreas } from '../schema';
import { newId } from '@/shared/lib/id';
import { nowMs } from '@/shared/lib/time';

export type LifeArea = InferSelectModel<typeof lifeAreas>;

export interface CreateLifeAreaInput {
  name: string;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateLifeAreaInput {
  name?: string;
  icon?: string | null;
  color?: string | null;
  hidden?: boolean;
}

export class LifeAreaRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Active, non-deleted, non-archived areas in display order (§6). */
  async list(): Promise<LifeArea[]> {
    return this.db
      .select()
      .from(lifeAreas)
      .where(and(isNull(lifeAreas.deletedAt), isNull(lifeAreas.archivedAt)))
      .orderBy(asc(lifeAreas.sortOrder));
  }

  async listArchived(): Promise<LifeArea[]> {
    return this.db
      .select()
      .from(lifeAreas)
      .where(and(isNull(lifeAreas.deletedAt), sql`${lifeAreas.archivedAt} is not null`))
      .orderBy(asc(lifeAreas.sortOrder));
  }

  async getById(id: string): Promise<LifeArea | undefined> {
    const rows = await this.db.select().from(lifeAreas).where(eq(lifeAreas.id, id));
    return rows[0];
  }

  async create(input: CreateLifeAreaInput): Promise<LifeArea> {
    const now = nowMs();
    const nextOrder = await this.nextSortOrder();
    const row: LifeArea = {
      id: newId(),
      name: input.name.trim(),
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: nextOrder,
      hidden: false,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    };
    await this.db.insert(lifeAreas).values(row);
    return row;
  }

  async update(id: string, patch: UpdateLifeAreaInput): Promise<void> {
    const next: Partial<LifeArea> = { updatedAt: nowMs() };
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.icon !== undefined) next.icon = patch.icon;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.hidden !== undefined) next.hidden = patch.hidden;
    await this.db.update(lifeAreas).set(next).where(eq(lifeAreas.id, id));
  }

  /** Soft-delete → goes to trash and can be restored (§43). */
  async softDelete(id: string): Promise<void> {
    await this.db.update(lifeAreas).set({ deletedAt: nowMs() }).where(eq(lifeAreas.id, id));
  }

  async restore(id: string): Promise<void> {
    await this.db.update(lifeAreas).set({ deletedAt: null }).where(eq(lifeAreas.id, id));
  }

  async archive(id: string): Promise<void> {
    await this.db
      .update(lifeAreas)
      .set({ archivedAt: nowMs(), updatedAt: nowMs() })
      .where(eq(lifeAreas.id, id));
  }

  async unarchive(id: string): Promise<void> {
    await this.db
      .update(lifeAreas)
      .set({ archivedAt: null, updatedAt: nowMs() })
      .where(eq(lifeAreas.id, id));
  }

  /** Persist a new ordering; `orderedIds` is the desired top-to-bottom order (§6). */
  async reorder(orderedIds: readonly string[]): Promise<void> {
    const now = nowMs();
    for (let i = 0; i < orderedIds.length; i += 1) {
      await this.db
        .update(lifeAreas)
        .set({ sortOrder: i, updatedAt: now })
        .where(eq(lifeAreas.id, orderedIds[i]!));
    }
  }

  private async nextSortOrder(): Promise<number> {
    const rows = await this.db.select({ value: max(lifeAreas.sortOrder) }).from(lifeAreas);
    const current = rows[0]?.value;
    return current === null || current === undefined ? 0 : current + 1;
  }
}
