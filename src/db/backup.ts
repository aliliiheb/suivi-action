import { createSqlJsDatabase, type SqlJsHandle } from './drivers/sqljs';
import { MIGRATIONS } from './migrations';
import equalGoalMeasures from './migrations/0004_equal_goal_measures.sql?raw';
import {
  GOAL_TYPES,
  validateMetrics,
  type GoalType,
  type MetricInput,
} from '@/domain/goals/goalTypes';

export interface JsonBackup {
  format: 'PROGRESS';
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

function rows(handle: SqlJsHandle, query: string): Record<string, unknown>[] {
  const result = handle.raw.exec(query)[0];
  return result
    ? result.values.map((row) =>
        Object.fromEntries(result.columns.map((name, index) => [name, row[index]])),
      )
    : [];
}

function tables(handle: SqlJsHandle): string[] {
  return rows(
    handle,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__migrations' ORDER BY name",
  ).map((row) => String(row.name));
}

export function exportJson(handle: SqlJsHandle): JsonBackup {
  return {
    format: 'PROGRESS',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(
      tables(handle).map((table) => [table, rows(handle, `SELECT * FROM ${quote(table)}`)]),
    ),
  };
}

/** Prevent spreadsheet formula execution when a text value is exported as CSV. */
export function exportCsv(
  handle: SqlJsHandle,
  table: 'tasks' | 'focus_sessions' | 'habit_logs',
): string {
  const data = rows(handle, `SELECT * FROM ${quote(table)}`);
  const columns = rows(handle, `PRAGMA table_info(${quote(table)})`).map((row) => String(row.name));
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      columns.map(cell).join(','),
      ...data.map((row) => columns.map((column) => cell(row[column])).join(',')),
    ].join('\r\n')
  );
}

function validate(handle: SqlJsHandle, expected: SqlJsHandle) {
  if (rows(handle, "SELECT name FROM sqlite_master WHERE type IN ('trigger', 'view')").length)
    throw new Error('Unsupported database objects');
  if (rows(handle, 'PRAGMA integrity_check')[0]?.integrity_check !== 'ok')
    throw new Error('Corrupt database');
  if (rows(handle, 'PRAGMA foreign_key_check').length) throw new Error('Broken relationships');
  if (JSON.stringify(tables(handle)) !== JSON.stringify(tables(expected)))
    throw new Error('Incompatible database');
  const measures = rows(handle, 'SELECT * FROM goal_metrics WHERE active = 1');
  for (const goal of rows(handle, 'SELECT * FROM goals')) {
    if (!GOAL_TYPES.includes(goal.goal_type as GoalType)) throw new Error('Invalid goal type');
    validateMetrics(
      goal.goal_type as GoalType,
      measures
        .filter((metric) => metric.goal_id === goal.id)
        .map(
          (metric) =>
            ({
              key: metric.key,
              target: metric.target,
              current: metric.current,
              weight: metric.weight,
              source: metric.source,
            }) as MetricInput,
        ),
    );
    if (goal.goal_type !== 'custom' && goal.progress_method !== 'metrics')
      throw new Error('Invalid typed goal progress method');
  }
  for (const table of tables(expected)) {
    const columns = rows(handle, `PRAGMA table_info(${quote(table)})`);
    const reference = rows(expected, `PRAGMA table_info(${quote(table)})`);
    if (JSON.stringify(columns) !== JSON.stringify(reference))
      throw new Error('Incompatible table');
    if (
      JSON.stringify(rows(handle, `PRAGMA foreign_key_list(${quote(table)})`)) !==
      JSON.stringify(rows(expected, `PRAGMA foreign_key_list(${quote(table)})`))
    )
      throw new Error('Incompatible relationships');
    for (const row of rows(handle, `SELECT * FROM ${quote(table)}`)) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number' && !Number.isFinite(value))
          throw new Error('Nonfinite number');
        if (['title', 'name'].includes(key) && value !== null && !String(value).trim())
          throw new Error('Empty required name');
        if (
          [
            'duration_min',
            'paused_min',
            'elapsed_ms',
            'paused_ms',
            'spent_min',
            'invested_min',
            'capacity_min',
          ].includes(key) &&
          (typeof value !== 'number' || value < 0)
        )
          throw new Error('Invalid duration');
        if (
          ['progress', 'manual_progress'].includes(key) &&
          value !== null &&
          (typeof value !== 'number' || value < 0 || value > 100)
        )
          throw new Error('Invalid progress');
        if (
          ['weight', 'estimated_min'].includes(key) &&
          value !== null &&
          (typeof value !== 'number' || value <= 0)
        )
          throw new Error('Invalid positive value');
      }
    }
  }
}

/** Validate in an isolated database before touching the user's storage. */
export async function prepareRestore(
  input: Uint8Array | string,
): Promise<{ bytes: Uint8Array; count: number }> {
  const reference = await createSqlJsDatabase();
  let candidate: SqlJsHandle | undefined;
  try {
    if (typeof input === 'string') {
      const json = JSON.parse(input) as JsonBackup;
      // v1 JSON backups from before typed goals have no goal_metrics table.
      if (
        json.format === 'PROGRESS' &&
        json.version === 1 &&
        json.tables &&
        !Object.hasOwn(json.tables, 'goal_metrics')
      )
        json.tables.goal_metrics = [];
      if (
        json.format !== 'PROGRESS' ||
        json.version !== 1 ||
        !json.tables ||
        JSON.stringify(Object.keys(json.tables).sort()) !== JSON.stringify(tables(reference))
      )
        throw new Error('Incompatible JSON');
      candidate = await createSqlJsDatabase();
      candidate.raw.run('PRAGMA foreign_keys = OFF');
      candidate.raw.run('BEGIN');
      for (const table of tables(reference)) {
        const columns = rows(reference, `PRAGMA table_info(${quote(table)})`).map((row) =>
          String(row.name),
        );
        const records = json.tables[table];
        if (!Array.isArray(records)) throw new Error('Invalid records');
        for (const record of records) {
          if (
            !record ||
            typeof record !== 'object' ||
            Array.isArray(record) ||
            Object.keys(record).some((key) => !columns.includes(key))
          )
            throw new Error('Invalid columns');
          const keys = Object.keys(record);
          if (!keys.length) throw new Error('Empty record');
          const values = keys.map((key) => record[key]);
          if (
            values.some(
              (value) => value !== null && typeof value !== 'number' && typeof value !== 'string',
            )
          )
            throw new Error('Invalid cell');
          candidate.raw.run(
            `INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            values as (string | number | null)[],
          );
        }
      }
      candidate.raw.run('COMMIT');
      candidate.raw.run('PRAGMA foreign_keys = ON');
    } else {
      const original = await createSqlJsDatabase(input, false);
      try {
        const applied = rows(original, 'SELECT name FROM __migrations').map((row) => row.name);
        if (
          !applied.length ||
          applied.some((name) => !MIGRATIONS.some((migration) => migration.name === name))
        )
          throw new Error('Unsupported backup version');
      } finally {
        original.raw.close();
      }
      candidate = await createSqlJsDatabase(input);
    }
    validate(candidate, reference);
    // JSON rows arrive after migrations, and older backups may contain custom weights.
    candidate.raw.run(equalGoalMeasures);
    const count = tables(candidate).reduce(
      (sum, table) =>
        sum +
        Number(rows(candidate!, `SELECT COUNT(*) AS count FROM ${quote(table)}`)[0]?.count ?? 0),
      0,
    );
    return { bytes: candidate.export(), count };
  } finally {
    candidate?.raw.close();
    reference.raw.close();
  }
}
