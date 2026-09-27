/**
 * PROGRESS — shared domain enumerations (spec §7, §10, §8).
 * Kept as const-object + union type so they are both runtime values (for selects,
 * validation, DB checks) and compile-time types.
 */

/** Goal lifecycle status (spec §7). */
export const GOAL_STATUS = [
  'draft',
  'planned',
  'active',
  'paused',
  'done',
  'abandoned',
  'archived',
] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

/** Task lifecycle status (spec §10). */
export const TASK_STATUS = [
  'inbox',
  'to_plan',
  'planned',
  'today',
  'in_progress',
  'waiting',
  'done',
  'cancelled',
  'archived',
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** Step / Project status (spec §9). */
export const STEP_STATUS = ['planned', 'active', 'paused', 'done', 'archived'] as const;
export type StepStatus = (typeof STEP_STATUS)[number];

/** Priority levels P1..P4 (spec §10). */
export const PRIORITY = ['p1', 'p2', 'p3', 'p4'] as const;
export type Priority = (typeof PRIORITY)[number];

/** Progression method (spec §8). */
export const PROGRESS_METHOD = ['tasks', 'numeric', 'manual', 'hybrid', 'metrics'] as const;
export type ProgressMethodName = (typeof PROGRESS_METHOD)[number];

/** Habit tracking type (spec §21). */
export const HABIT_TRACKING = ['boolean', 'count', 'duration'] as const;
export type HabitTracking = (typeof HABIT_TRACKING)[number];

/** Focus session entry type (spec §18). */
export const FOCUS_ENTRY = ['automatic', 'manual'] as const;
export type FocusEntry = (typeof FOCUS_ENTRY)[number];

/** Theme preference (spec §46). */
export const THEME = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEME)[number];

/** Supported UI languages (spec §47). */
export const LANGUAGE = ['fr', 'en', 'ar'] as const;
export type Language = (typeof LANGUAGE)[number];

/** Languages rendered right-to-left (spec §48). */
export const RTL_LANGUAGES: readonly Language[] = ['ar'];
export function isRtl(language: Language): boolean {
  return RTL_LANGUAGES.includes(language);
}
