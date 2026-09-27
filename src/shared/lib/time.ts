import { format, startOfDay, endOfDay, addDays } from 'date-fns';

/** Current time in epoch milliseconds (UTC). Storage is tz-agnostic (spec §49). */
export function nowMs(): number {
  return Date.now();
}

/** Local start-of-day in epoch ms — the canonical value stored for planned dates. */
export function startOfDayMs(date: Date | number = new Date()): number {
  return startOfDay(date).getTime();
}

/** Local end-of-day in epoch ms (inclusive upper bound for a day's range). */
export function endOfDayMs(date: Date | number = new Date()): number {
  return endOfDay(date).getTime();
}

/** Start-of-day epoch ms, `days` days from `date`. */
export function addDaysMs(days: number, date: Date | number = new Date()): number {
  return startOfDay(addDays(date, days)).getTime();
}

/** Local day key 'YYYY-MM-DD' used for per-day grouping (focus, habits). */
export function dayKey(date: Date | number = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** Format a minute count as e.g. "1 h 36", "45 min", "0 min". */
export function formatDuration(minutes: number, minLabel = 'min'): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} ${minLabel}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`;
}
