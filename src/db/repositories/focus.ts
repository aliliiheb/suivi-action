import { atomic } from '../transaction';
import { desc, eq, isNull, and, sum } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { focusSessions, tasks, goals } from '../schema';
import { newId } from '@/shared/lib/id';
import { dayKey, nowMs } from '@/shared/lib/time';
import { advanceTimer } from '@/domain/focus/timer';
import { TaskRepository } from './tasks';
import { ProgressService } from '../services/progressService';

export type FocusSession = InferSelectModel<typeof focusSessions>;

export class FocusRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Completed focus minutes on this local day, without the history list's limit. */
  async durationForDay(date: string): Promise<number> {
    const result = this.db
      .select({ minutes: sum(focusSessions.durationMin) })
      .from(focusSessions)
      .where(and(eq(focusSessions.date, date), eq(focusSessions.state, 'stopped')))
      .get();
    return Number(result?.minutes ?? 0);
  }

  async active(): Promise<FocusSession | undefined> {
    return this.db.select().from(focusSessions).where(isNull(focusSessions.endedAt)).get();
  }

  async history(): Promise<(FocusSession & { taskTitle: string | null })[]> {
    return this.db
      .select()
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .orderBy(desc(focusSessions.startedAt))
      .limit(100)
      .all()
      .map((row) => ({ ...row.focus_sessions, taskTitle: row.tasks?.title ?? null }));
  }

  async start(taskId: string, targetMin: number | null = null, now = nowMs()): Promise<void> {
    if (targetMin !== null && (!Number.isInteger(targetMin) || targetMin < 1 || targetMin > 240))
      throw new Error('Invalid focus target');
    atomic(this.db, (tx) => {
      if (tx.select().from(focusSessions).where(isNull(focusSessions.endedAt)).get())
        throw new Error('A session is already active');
      const task = tx.select().from(tasks).where(eq(tasks.id, taskId)).get();
      if (
        !task ||
        task.deletedAt ||
        task.completed ||
        ['cancelled', 'archived'].includes(task.status)
      )
        throw new Error('Unavailable task');
      const goal = task.goalId
        ? tx.select().from(goals).where(eq(goals.id, task.goalId)).get()
        : undefined;
      tx.insert(focusSessions)
        .values({
          id: newId(),
          taskId,
          goalId: task.goalId,
          stepId: task.stepId,
          projectId: task.projectId,
          areaId: goal?.areaId,
          date: dayKey(now),
          startedAt: now,
          createdAt: now,
          lastTickAt: now,
          state: 'running',
          targetMin,
        })
        .run();
    });
  }

  /** On restart keep the last persisted work duration, exclude unobserved absence. */
  async recover(now = nowMs()): Promise<void> {
    const active = await this.active();
    if (!active) return;
    this.db
      .update(focusSessions)
      .set({
        state: 'paused',
        recovered: true,
        pausedMs: active.pausedMs + Math.max(0, now - active.lastTickAt),
        lastTickAt: now,
      })
      .where(eq(focusSessions.id, active.id))
      .run();
  }

  async tick(now = nowMs()): Promise<void> {
    const active = await this.active();
    if (!active || active.state !== 'running') return;
    const next = advanceTimer(active, now);
    // A Pomodoro ends at its target even if the application was sleeping.
    if (active.targetMin !== null && next.elapsedMs >= active.targetMin * 60000) {
      next.elapsedMs = active.targetMin * 60000;
      next.state = 'paused';
    }
    this.db.update(focusSessions).set(next).where(eq(focusSessions.id, active.id)).run();
  }

  async setPaused(paused: boolean, now = nowMs()): Promise<void> {
    const active = await this.active();
    if (!active) return;
    const next = advanceTimer(active, now);
    this.db
      .update(focusSessions)
      .set({
        ...next,
        state: paused ? 'paused' : 'running',
        recovered: false,
        targetMin:
          !paused && active.targetMin !== null && next.elapsedMs >= active.targetMin * 60000
            ? null
            : active.targetMin,
      })
      .where(eq(focusSessions.id, active.id))
      .run();
  }

  async stop(comment: string, completeTask = false, now = nowMs()): Promise<void> {
    const active = await this.active();
    if (!active) return;
    const timer = advanceTimer(active, now);
    const elapsedMs =
      active.targetMin === null
        ? timer.elapsedMs
        : Math.min(timer.elapsedMs, active.targetMin * 60000);
    atomic(this.db, (tx) => {
      tx.update(focusSessions)
        .set({
          ...timer,
          elapsedMs,
          state: 'stopped',
          endedAt: now,
          durationMin: elapsedMs / 60000,
          pausedMin: timer.pausedMs / 60000,
          comment: comment.trim() || null,
          recovered: false,
        })
        .where(eq(focusSessions.id, active.id))
        .run();
    });
    if (active.taskId) {
      await this.updateTaskTime(active.taskId);
      const task = await new TaskRepository(this.db).getById(active.taskId);
      if (completeTask && task && !task.deletedAt)
        await new TaskRepository(this.db).setCompleted(active.taskId, true);
    }
    if (active.goalId) await new ProgressService(this.db).recomputeGoal(active.goalId);
  }

  async addManual(taskId: string, minutes: number, date: string, comment: string): Promise<void> {
    if (
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      minutes > 1440 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    )
      throw new Error('Invalid manual session');
    const task = await new TaskRepository(this.db).getById(taskId);
    if (!task || task.deletedAt) throw new Error('Unavailable task');
    const goal = task.goalId
      ? this.db.select().from(goals).where(eq(goals.id, task.goalId)).get()
      : undefined;
    const startedAt = new Date(`${date}T00:00:00`).getTime();
    if (!Number.isFinite(startedAt)) throw new Error('Invalid date');
    this.db
      .insert(focusSessions)
      .values({
        id: newId(),
        taskId,
        goalId: task.goalId,
        stepId: task.stepId,
        projectId: task.projectId,
        areaId: goal?.areaId,
        date,
        startedAt,
        endedAt: startedAt + minutes * 60000,
        durationMin: minutes,
        elapsedMs: minutes * 60000,
        lastTickAt: startedAt + minutes * 60000,
        comment,
        entryType: 'manual',
        state: 'stopped',
        createdAt: nowMs(),
      })
      .run();
    await this.updateTaskTime(taskId);
    if (task.goalId) await new ProgressService(this.db).recomputeGoal(task.goalId);
  }

  private async updateTaskTime(taskId: string) {
    const total = this.db
      .select({ minutes: sum(focusSessions.durationMin) })
      .from(focusSessions)
      .where(and(eq(focusSessions.taskId, taskId), eq(focusSessions.state, 'stopped')))
      .get();
    this.db
      .update(tasks)
      .set({ spentMin: Number(total?.minutes ?? 0), updatedAt: nowMs() })
      .where(eq(tasks.id, taskId))
      .run();
  }
}
