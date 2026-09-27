import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
export async function connectDatabase({
  url = process.env.DATABASE_URL,
  directory = process.env.PLANS_DEMO_DIR,
} = {}) {
  let db;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    db = {
      query: (sql, args) => pool.query(sql, args),
      close: () => pool.end(),
      transaction: async (fn) => {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await fn(connection);
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK');
          throw error;
        } finally {
          connection.release();
        }
      },
    };
  } else {
    if (!directory)
      throw new Error('DATABASE_URL obligatoire, ou PLANS_DEMO_DIR pour une démonstration locale.');
    if (process.env.NODE_ENV === 'production')
      throw new Error('PostgreSQL distant obligatoire en production.');
    const { PGlite } = await import('@electric-sql/pglite');
    const local = new PGlite(directory === ':memory:' ? undefined : directory);
    db = {
      query: (sql, args) => local.query(sql, args),
      transaction: (fn) => local.transaction(fn),
      close: () => local.close(),
    };
  }
  const migrationDirectory = new URL('./migrations/', import.meta.url);
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  await db.transaction(async (tx) => {
    await tx.query('CREATE TABLE IF NOT EXISTS plan_migrations (version integer PRIMARY KEY)');
    await tx.query('LOCK TABLE plan_migrations IN ACCESS EXCLUSIVE MODE');
    for (const name of migrations) {
      const version = Number(name.split('_')[0]);
      if (
        (await tx.query('SELECT version FROM plan_migrations WHERE version=$1', [version])).rows
          .length
      )
        continue;
      const sql = await readFile(new URL(name, migrationDirectory), 'utf8');
      for (const statement of sql.split(';').filter((s) => s.trim())) await tx.query(statement);
      await tx.query('INSERT INTO plan_migrations(version) VALUES($1) ON CONFLICT DO NOTHING', [
        version,
      ]);
    }
  });
  return db;
}
