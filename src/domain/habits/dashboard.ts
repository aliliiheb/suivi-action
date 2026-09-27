import { addDays } from 'date-fns';
import { dayKey } from '@/shared/lib/time';
import { isHabitDay } from './statistics';
import type { HabitRepository } from '@/db/repositories/habits';
export type HabitRows = Awaited<ReturnType<HabitRepository['summary']>>;
export function habitTarget(row: HabitRows[number]) {
  return row.habit.tracking === 'boolean' ? 1 : (row.habit.targetValue ?? 1);
}
export function habitDayCounts(rows: HabitRows, date: string) {
  let due = 0,
    done = 0;
  for (const row of rows) {
    if (!row.habit.active || !isHabitDay(row.habit, date)) continue;
    due++;
    if ((row.logs.find((log) => log.date === date)?.value ?? 0) >= habitTarget(row)) done++;
  }
  return { due, done, percent: due ? (done / due) * 100 : 0 };
}
export function habitDashboard(rows: HabitRows, date: string) {
  const end = new Date(`${date}T12:00:00`);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(addDays(end, i - 6));
    return { date: key, ...habitDayCounts(rows, key) };
  });
  const due = week.reduce((sum, day) => sum + day.due, 0),
    done = week.reduce((sum, day) => sum + day.done, 0);
  return {
    week,
    weekly: due ? (done / due) * 100 : 0,
    today: habitDayCounts(rows, date),
    active: rows.filter((row) => row.habit.active).length,
    best: Math.max(0, ...rows.map((row) => row.stats.best)),
    minutes: rows
      .filter((row) => row.habit.tracking === 'duration')
      .reduce(
        (sum, row) =>
          sum +
          row.logs.filter((log) => log.date <= date).reduce((value, log) => value + log.value, 0),
        0,
      ),
  };
}
