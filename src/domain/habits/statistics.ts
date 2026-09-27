import { addDays, differenceInCalendarDays } from 'date-fns';
import { dayKey } from '@/shared/lib/time';

export interface HabitSchedule {
  createdAt: number;
  frequency: string;
  daysOfWeek: string | null;
  targetValue: number | null;
  tracking: string;
}
export function isHabitDay(habit: HabitSchedule, date: string): boolean {
  if (date < dayKey(habit.createdAt)) return false;
  if (habit.frequency === 'daily') return true;
  const days: number[] = habit.daysOfWeek ? JSON.parse(habit.daysOfWeek) : [1];
  return days.includes(new Date(`${date}T12:00:00`).getDay());
}

/** Streaks count consecutive scheduled days. Today can remain unfinished until midnight. */
export function habitStatistics(
  habit: HabitSchedule,
  logs: { date: string; value: number }[],
  today = dayKey(),
) {
  const values = new Map(logs.map((log) => [log.date, log.value]));
  const target = habit.tracking === 'boolean' ? 1 : (habit.targetValue ?? 1);
  const first = new Date(`${dayKey(habit.createdAt)}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  let current = 0;
  let best = 0;
  let scheduled = 0;
  let done = 0;
  let totalValue = 0;
  const length = Math.max(0, differenceInCalendarDays(end, first));
  for (let i = 0; i <= length; i++) {
    const date = dayKey(addDays(first, i));
    if (!isHabitDay(habit, date)) continue;
    const value = values.get(date) ?? 0;
    totalValue += value;
    if (date !== today || value >= target) scheduled++;
    if (value >= target) {
      done++;
      current++;
      best = Math.max(best, current);
    } else if (date !== today) current = 0;
  }
  return {
    current,
    best,
    done,
    scheduled,
    successRate: scheduled ? (done / scheduled) * 100 : 0,
    average: scheduled ? totalValue / scheduled : 0,
  };
}
