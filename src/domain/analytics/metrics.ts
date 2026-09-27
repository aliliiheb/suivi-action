import { differenceInCalendarDays, eachDayOfInterval } from 'date-fns';
import { dayKey } from '@/shared/lib/time';

export interface SessionMetric {
  date: string;
  durationMin: number;
  goalId: string | null;
  areaId: string | null;
  projectId: string | null;
}
export function aggregateSessions(sessions: SessionMetric[], from: string, to: string) {
  const first = new Date(`${from}T12:00:00`),
    last = new Date(`${to}T12:00:00`);
  const days = Math.max(1, differenceInCalendarDays(last, first) + 1);
  const byDay = new Map<string, number>();
  const byGoal = new Map<string, number>();
  const byArea = new Map<string, number>();
  const byProject = new Map<string, number>();
  let minutes = 0;
  for (const session of sessions) {
    if (session.date < from || session.date > to) continue;
    minutes += session.durationMin;
    byDay.set(session.date, (byDay.get(session.date) ?? 0) + session.durationMin);
    for (const [map, key] of [
      [byGoal, session.goalId],
      [byArea, session.areaId],
      [byProject, session.projectId],
    ] as const) {
      map.set(key ?? '', (map.get(key ?? '') ?? 0) + session.durationMin);
    }
  }
  return {
    minutes,
    average: minutes / days,
    activeDays: [...byDay.values()].filter((minutes) => minutes > 0).length,
    regularity: ([...byDay.values()].filter((minutes) => minutes > 0).length / days) * 100,
    daily: eachDayOfInterval({ start: first, end: last }).map((date) => ({
      date: dayKey(date),
      minutes: byDay.get(dayKey(date)) ?? 0,
    })),
    byGoal,
    byArea,
    byProject,
  };
}
