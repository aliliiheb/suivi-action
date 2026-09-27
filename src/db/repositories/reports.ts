import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import {
  focusSessions,
  goals,
  tasks,
  lifeAreas,
  projects,
  goalProgressSnapshots,
  weeklyReviews,
  monthlyReviews,
} from '../schema';
import { aggregateSessions } from '@/domain/analytics/metrics';
import { newId } from '@/shared/lib/id';
import { nowMs } from '@/shared/lib/time';

export class ReportsRepository {
  constructor(private readonly db: AppDatabase) {}
  async report(from: string, to: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
      throw new Error('Invalid report range');
    const start = new Date(`${from}T00:00:00`).getTime(),
      end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 3660 * 86400000)
      throw new Error('Invalid report range');
    const sessions = this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          gte(focusSessions.date, from),
          lte(focusSessions.date, to),
          isNotNull(focusSessions.endedAt),
        ),
      )
      .all();
    const completed = this.db
      .select()
      .from(tasks)
      .where(
        and(
          isNull(tasks.deletedAt),
          eq(tasks.completed, true),
          gte(tasks.completedAt, start),
          lte(tasks.completedAt, end),
        ),
      )
      .all();
    const planned = this.db
      .select()
      .from(tasks)
      .where(
        and(isNull(tasks.deletedAt), gte(tasks.plannedDate, start), lte(tasks.plannedDate, end)),
      )
      .all();
    const goalRows = this.db.select().from(goals).where(isNull(goals.deletedAt)).all();
    const areaRows = this.db.select().from(lifeAreas).all();
    const projectRows = this.db.select().from(projects).all();
    const snapshots = this.db
      .select()
      .from(goalProgressSnapshots)
      .where(and(gte(goalProgressSnapshots.date, from), lte(goalProgressSnapshots.date, to)))
      .all();
    const stats = aggregateSessions(sessions, from, to);
    return {
      ...stats,
      sessions,
      completed,
      planned,
      goals: goalRows,
      areas: areaRows,
      projects: projectRows,
      snapshots,
      completionRate: planned.length
        ? (planned.filter((task) => task.completed).length / planned.length) * 100
        : 0,
      estimatedMin: planned.reduce((sum, task) => sum + (task.estimatedMin ?? 0), 0),
    };
  }
  async review(kind: 'weekly' | 'monthly', date: string) {
    if (kind === 'weekly')
      return this.db.select().from(weeklyReviews).where(eq(weeklyReviews.weekStart, date)).get();
    return this.db
      .select()
      .from(monthlyReviews)
      .where(eq(monthlyReviews.month, date.slice(0, 7)))
      .get();
  }
  async saveReview(
    kind: 'weekly' | 'monthly',
    date: string,
    answers: { wentWell: string; blocked: string; toImprove: string; nextPriorities: string },
    metrics: { minutes: number; completed: number; regularity: number },
  ): Promise<void> {
    const now = nowMs();
    const metricsJson = JSON.stringify(metrics);
    if (kind === 'weekly')
      this.db
        .insert(weeklyReviews)
        .values({
          id: newId(),
          weekStart: date,
          ...answers,
          metricsJson,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: weeklyReviews.weekStart,
          set: { ...answers, metricsJson, updatedAt: now },
        })
        .run();
    else
      this.db
        .insert(monthlyReviews)
        .values({
          id: newId(),
          month: date.slice(0, 7),
          notes: JSON.stringify(answers),
          metricsJson,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: monthlyReviews.month,
          set: { notes: JSON.stringify(answers), metricsJson, updatedAt: now },
        })
        .run();
  }
}
