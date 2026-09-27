import { sql } from 'drizzle-orm';
import type { AppDatabase } from './drivers/sqljs';

let sequence = 0;
/** Savepoints compose safely with repository transactions and async service operations. */
export function atomic<T>(db: AppDatabase, fn: (db: AppDatabase) => T): T {
  const name = `operation_${++sequence}`;
  db.run(sql.raw(`SAVEPOINT ${name}`));
  try {
    const result = fn(db);
    db.run(sql.raw(`RELEASE SAVEPOINT ${name}`));
    return result;
  } catch (err) {
    db.run(sql.raw(`ROLLBACK TO SAVEPOINT ${name}`));
    db.run(sql.raw(`RELEASE SAVEPOINT ${name}`));
    throw err;
  }
}

export async function atomicAsync<T>(db: AppDatabase, fn: () => Promise<T>): Promise<T> {
  const name = `operation_${++sequence}`;
  db.run(sql.raw(`SAVEPOINT ${name}`));
  try {
    const result = await fn();
    db.run(sql.raw(`RELEASE SAVEPOINT ${name}`));
    return result;
  } catch (err) {
    db.run(sql.raw(`ROLLBACK TO SAVEPOINT ${name}`));
    db.run(sql.raw(`RELEASE SAVEPOINT ${name}`));
    throw err;
  }
}
