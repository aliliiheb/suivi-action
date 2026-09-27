/**
 * Ordered list of SQL migrations. The `?raw` import is understood by Vite (app)
 * and Vitest (tests) alike, so the exact same SQL drizzle-kit generated runs in
 * every environment. Append new migrations here in order.
 */
import init0000 from './migrations/0000_init.sql?raw';
import daily0001 from './migrations/0001_daily_capacity.sql?raw';
import focus0002 from './migrations/0002_focus_timer.sql?raw';
import types0003 from './migrations/0003_goal_types.sql?raw';
import equal0004 from './migrations/0004_equal_goal_measures.sql?raw';

export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { name: '0000_init', sql: init0000 },
  { name: '0001_daily_capacity', sql: daily0001 },
  { name: '0002_focus_timer', sql: focus0002 },
  { name: '0003_goal_types', sql: types0003 },
  { name: '0004_equal_goal_measures', sql: equal0004 },
];
