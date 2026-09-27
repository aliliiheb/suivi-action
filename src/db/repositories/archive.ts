import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { atomicAsync } from '../transaction';
import { ProgressService } from '../services/progressService';

const entities = {
  areas: { table: 'life_areas', title: 'name', archive: true },
  goals: { table: 'goals', title: 'title', archive: true },
  steps: { table: 'goal_steps', title: 'title', archive: false },
  projects: { table: 'projects', title: 'title', archive: false },
  tasks: { table: 'tasks', title: 'title', archive: true },
  habits: { table: 'habits', title: 'title', archive: true },
} as const;
export type ArchiveKind = keyof typeof entities;
export interface ArchiveItem {
  id: string;
  title: string;
  kind: ArchiveKind;
}

export class ArchiveRepository {
  constructor(private readonly db: AppDatabase) {}
  async list(archived = false): Promise<ArchiveItem[]> {
    const items: ArchiveItem[] = [];
    for (const [kind, config] of Object.entries(entities)) {
      const where = archived
        ? config.archive
          ? 'archived_at IS NOT NULL AND deleted_at IS NULL'
          : "status = 'archived' AND deleted_at IS NULL"
        : 'deleted_at IS NOT NULL';
      const rows = this.db.all<{ id: string; title: string }>(
        sql.raw(`SELECT id, ${config.title} AS title FROM ${config.table} WHERE ${where}`),
      );
      items.push(...rows.map((row) => ({ ...row, kind: kind as ArchiveKind })));
    }
    return items;
  }
  async restore(kind: ArchiveKind, id: string): Promise<void> {
    await atomicAsync(this.db, async () => {
      const config = entities[kind];
      const row = this.db.get<{ goal_id?: string; step_id?: string; project_id?: string }>(
        sql`SELECT * FROM ${sql.identifier(config.table)} WHERE id = ${id}`,
      );
      if (!row) throw new Error('Missing item');
      if (row.goal_id)
        this.db.run(
          sql`UPDATE goals SET deleted_at = NULL, archived_at = NULL WHERE id = ${row.goal_id}`,
        );
      if (row.step_id)
        this.db.run(sql`UPDATE goal_steps SET deleted_at = NULL WHERE id = ${row.step_id}`);
      if (row.project_id)
        this.db.run(sql`UPDATE projects SET deleted_at = NULL WHERE id = ${row.project_id}`);
      this.db.run(
        sql`UPDATE ${sql.identifier(config.table)} SET deleted_at = NULL, updated_at = ${Date.now()} ${sql.raw(config.archive ? ', archived_at = NULL' : '')} WHERE id = ${id}`,
      );
      if (kind !== 'areas' && kind !== 'habits')
        this.db.run(
          sql`UPDATE ${sql.identifier(config.table)} SET status = 'planned' WHERE id = ${id} AND status = 'archived'`,
        );
      if (kind === 'goals' || row.goal_id)
        await new ProgressService(this.db).recomputeGoal(kind === 'goals' ? id : row.goal_id!);
    });
  }
}
