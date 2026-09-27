/**
 * sql.js (WASM) driver — used by unit/integration tests and by the in-browser
 * preview build (runs with no Rust toolchain, spec architecture §3). Production
 * uses the tauri-plugin-sql driver instead; both consume the same schema and the
 * same generated migrations, so behaviour is identical.
 */
import * as sqlJsModule from 'sql.js';
import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js';
// Vite + Vitest both resolve this to a real asset path for locateFile().
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from '../schema';
import { runMigrations, type MigrationRunner } from '../migrate';

// sql.js is published as CommonJS; depending on the bundler the callable init is
// either the module's default or the namespace itself. Support both.
type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
const initSqlJs: InitSqlJs =
  (sqlJsModule as unknown as { default?: InitSqlJs }).default ??
  (sqlJsModule as unknown as InitSqlJs);

export type AppDatabase = SQLJsDatabase<typeof schema>;

/** Resolve the .wasm location for whichever environment we run in. */
async function resolveLocateFile(): Promise<(file: string) => string> {
  const isNode =
    typeof process !== 'undefined' &&
    !!(process as { versions?: { node?: string } }).versions?.node;
  if (isNode) {
    // Node / Vitest: give sql.js an absolute filesystem path to its own dist dir.
    // Tests run with cwd = project root, so resolve from there.
    const path = await import(/* @vite-ignore */ 'node:path');
    const dir = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist') + path.sep;
    return (file: string) => dir + file;
  }
  // Browser (Vite): use the bundled asset URL.
  return () => wasmUrl;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = resolveLocateFile()
      .then((locateFile) => initSqlJs({ locateFile }))
      .catch((err) => {
        sqlJsPromise = null; // don't cache a failed init
        throw err;
      });
  }
  return sqlJsPromise;
}

export interface SqlJsHandle {
  /** Typed Drizzle client. */
  db: AppDatabase;
  /** Underlying sql.js database (for export/import and raw PRAGMAs). */
  raw: SqlJsDatabase;
  /** Serialize the whole database to bytes, for persistence/backup (§54). */
  export(): Uint8Array;
}

/**
 * Open a sql.js database (optionally from previously exported bytes), enable
 * foreign keys, and bring it up to the latest migration.
 */
export async function createSqlJsDatabase(
  bytes?: Uint8Array,
  migrate = true,
): Promise<SqlJsHandle> {
  const SQL = await loadSqlJs();
  const raw = new SQL.Database(bytes ?? undefined);
  raw.run('PRAGMA foreign_keys = ON;');

  const runner: MigrationRunner = {
    exec: (sql) => {
      raw.run(sql);
    },
    appliedNames: () => {
      const res = raw.exec('SELECT name FROM __migrations');
      const first = res[0];
      if (!first) return [];
      return first.values.map((row) => String(row[0]));
    },
    recordApplied: (name) => {
      raw.run('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)', [name, Date.now()]);
    },
    transaction: (fn) => {
      raw.run('BEGIN');
      let result: void | Promise<void>;
      try {
        result = fn();
      } catch (err) {
        raw.run('ROLLBACK');
        throw err;
      }
      if (result instanceof Promise) {
        return result.then(
          () => {
            raw.run('COMMIT');
          },
          (err) => {
            raw.run('ROLLBACK');
            throw err;
          },
        );
      }
      raw.run('COMMIT');
    },
  };

  if (migrate) await runMigrations(runner);

  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    export: () => {
      const bytes = raw.export();
      // sql.js reopens its connection during export; restore connection pragmas.
      raw.run('PRAGMA foreign_keys = ON;');
      return bytes;
    },
  };
}
