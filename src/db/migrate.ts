/**
 * Driver-agnostic migration runner. Applies any migrations not yet recorded in
 * the `__migrations` bookkeeping table, inside a transaction, so a partially
 * applied migration never leaves an inconsistent database (spec §53, §82).
 *
 * `exec` runs one or more SQL statements; `selectNames` returns already-applied
 * migration names. Both are provided by the concrete driver (sql.js, tauri-sql).
 */
import { MIGRATIONS } from './migrations';

export interface MigrationRunner {
  exec(sql: string): void | Promise<void>;
  appliedNames(): string[] | Promise<string[]>;
  recordApplied(name: string): void | Promise<void>;
  transaction(fn: () => Promise<void> | void): Promise<void> | void;
}

/** Split drizzle's SQL into individual statements on its breakpoint marker. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runMigrations(runner: MigrationRunner): Promise<number> {
  await runner.exec(
    `CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`,
  );
  const applied = new Set(await runner.appliedNames());
  let count = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    await runner.transaction(async () => {
      for (const statement of splitStatements(migration.sql)) {
        await runner.exec(statement);
      }
      await runner.recordApplied(migration.name);
    });
    count += 1;
  }
  return count;
}
