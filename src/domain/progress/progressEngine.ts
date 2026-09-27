/**
 * PROGRESS — Central progression engine (spec §13, §14).
 *
 * This module is the SINGLE source of truth for every progression calculation.
 * It is pure (no React, no DB, no I/O) so it can be unit-tested in isolation and
 * reused everywhere (Task → Step/Project → Goal → Area, Today, Dashboard,
 * Analytics, Reviews). UI components must never re-implement these formulas.
 *
 * Invariants enforced everywhere:
 *  - never divide by zero;
 *  - result is always clamped to [0, 100];
 *  - never negative, never above 100;
 *  - stable when children are removed (empty set → 0, not NaN).
 */

/** The four supported progression methods (spec §8). */
export type ProgressMethod = 'tasks' | 'numeric' | 'manual' | 'hybrid';

/** A child contributing to a weighted rollup. `weight` defaults to 1. */
export interface WeightedNode {
  /** Progress of this child, expected in [0, 100] (clamped defensively). */
  progress: number;
  /** Relative weight; when omitted every sibling weighs the same (spec §13). */
  weight?: number;
}

/** Clamp any number into the [0, 100] percentage range; NaN becomes 0. */
export function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/** Round to one decimal place for display-stable percentages. */
export function roundPercent(value: number): number {
  return Math.round(clampPercent(value) * 10) / 10;
}

/**
 * Weighted rollup (spec §13):
 *   progress(node) = Σ(progress(child) × weight(child)) / Σ(weight(child))
 *
 * - Empty list → 0 (no divide-by-zero).
 * - Children with weight ≤ 0 are ignored (they cannot drag the average).
 * - If every weight is ≤ 0, returns 0.
 */
export function rollupProgress(children: readonly WeightedNode[]): number {
  if (children.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const child of children) {
    const weight = child.weight ?? 1;
    if (weight <= 0) continue;
    weightedSum += clampPercent(child.progress) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 0;
  return clampPercent(weightedSum / totalWeight);
}

/** A task's subtask, for task-progress computation. */
export interface SubtaskLike {
  completed: boolean;
}

/**
 * Progress of a single task (spec §11, §13):
 *  - no subtasks → 100 if completed else 0;
 *  - with subtasks → ratio of completed subtasks.
 */
export function taskProgress(task: {
  completed: boolean;
  subtasks?: readonly SubtaskLike[];
}): number {
  const subtasks = task.subtasks ?? [];
  if (subtasks.length === 0) return task.completed ? 100 : 0;
  const done = subtasks.filter((s) => s.completed).length;
  return clampPercent((done / subtasks.length) * 100);
}

/**
 * Numeric progress for quantifiable goals (spec §8B):
 *   progress = current / target × 100
 * Guarded against target ≤ 0 and clamped (current may exceed target).
 */
export function numericProgress(current: number, target: number): number {
  if (target <= 0) return 0;
  return clampPercent((current / target) * 100);
}

/** One dimension of a hybrid goal; `weight` is a percentage (spec §8D). */
export interface HybridComponent {
  /** This dimension's own progress in [0, 100]. */
  value: number;
  /** Weight in percent; the set is expected to total 100. */
  weight: number;
}

/**
 * Hybrid progress (spec §8D): weighted blend of several dimensions whose weights
 * are meant to total 100%. We normalise by the actual sum of weights so the
 * result stays correct even if the caller's weights do not sum to exactly 100.
 */
export function hybridProgress(components: readonly HybridComponent[]): number {
  if (components.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of components) {
    if (c.weight <= 0) continue;
    weightedSum += clampPercent(c.value) * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight <= 0) return 0;
  return clampPercent(weightedSum / totalWeight);
}

/** Validate that hybrid weights sum to 100 (±0.01), for form validation (§60). */
export function hybridWeightsValid(components: readonly HybridComponent[]): boolean {
  const total = components.reduce((sum, c) => sum + c.weight, 0);
  return Math.abs(total - 100) < 0.01;
}

// ── Planned vs. actual progression (spec §14) ───────────────────────────────

/** Pace classification relative to the linear expected curve. */
export type Pace = 'ahead' | 'on-track' | 'slightly-behind' | 'behind';

export interface PlannedVsActual {
  /** Theoretical linear progress at `now` given start → deadline, in [0, 100]. */
  expected: number;
  /** Actual measured progress, in [0, 100]. */
  actual: number;
  /** actual − expected, in percentage points (can be negative). */
  delta: number;
  /** Human-facing pace bucket derived from `delta`. */
  pace: Pace;
}

/**
 * Linear expected progress (spec §14): fraction of the elapsed timespan.
 *  - before start → 0; after deadline → 100;
 *  - zero/negative timespan → 0 until the instant, then 100.
 */
export function expectedProgress(startMs: number, deadlineMs: number, nowMs: number): number {
  if (deadlineMs <= startMs) return nowMs >= deadlineMs ? 100 : 0;
  if (nowMs <= startMs) return 0;
  if (nowMs >= deadlineMs) return 100;
  const ratio = (nowMs - startMs) / (deadlineMs - startMs);
  return clampPercent(ratio * 100);
}

/**
 * Pace thresholds (documented so they are never arbitrary, spec §29):
 *   delta ≥ +2  → ahead
 *   −2 ≤ delta  → on-track
 *   −10 ≤ delta → slightly-behind
 *   else        → behind
 */
export function classifyPace(delta: number): Pace {
  if (delta >= 2) return 'ahead';
  if (delta >= -2) return 'on-track';
  if (delta >= -10) return 'slightly-behind';
  return 'behind';
}

/** Compare actual progress against the linear plan (spec §14). */
export function plannedVsActual(args: {
  startMs: number;
  deadlineMs: number;
  nowMs: number;
  actual: number;
}): PlannedVsActual {
  const expected = roundPercent(expectedProgress(args.startMs, args.deadlineMs, args.nowMs));
  const actual = roundPercent(args.actual);
  const delta = Math.round((actual - expected) * 10) / 10;
  return { expected, actual, delta, pace: classifyPace(delta) };
}
