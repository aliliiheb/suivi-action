import { describe, it, expect } from 'vitest';
import {
  clampPercent,
  rollupProgress,
  taskProgress,
  numericProgress,
  hybridProgress,
  hybridWeightsValid,
  expectedProgress,
  classifyPace,
  plannedVsActual,
} from '@/domain/progress/progressEngine';

const DAY = 24 * 60 * 60 * 1000;

describe('clampPercent', () => {
  it('clamps to [0,100] and coerces NaN/Infinity to 0', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42)).toBe(42);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('rollupProgress (weighted, §13)', () => {
  it('returns 0 for no children (no divide-by-zero)', () => {
    expect(rollupProgress([])).toBe(0);
  });

  it('averages equal weights when none are specified', () => {
    expect(rollupProgress([{ progress: 0 }, { progress: 100 }])).toBe(50);
  });

  it('respects custom weights', () => {
    // 100*3 + 0*1 = 300 / 4 = 75
    expect(
      rollupProgress([
        { progress: 100, weight: 3 },
        { progress: 0, weight: 1 },
      ]),
    ).toBe(75);
  });

  it('ignores non-positive weights and clamps child values', () => {
    expect(
      rollupProgress([
        { progress: 200, weight: 0 },
        { progress: 80, weight: 2 },
      ]),
    ).toBe(80);
    expect(
      rollupProgress([
        { progress: 50, weight: 0 },
        { progress: 50, weight: -1 },
      ]),
    ).toBe(0);
  });

  it('12 of 20 equally-weighted completed tasks → 60% (§8A)', () => {
    const children = Array.from({ length: 20 }, (_, i) => ({ progress: i < 12 ? 100 : 0 }));
    expect(rollupProgress(children)).toBe(60);
  });
});

describe('taskProgress (§11, §13)', () => {
  it('simple task is 0 or 100', () => {
    expect(taskProgress({ completed: false })).toBe(0);
    expect(taskProgress({ completed: true })).toBe(100);
  });

  it('rolls up from subtasks regardless of parent flag', () => {
    expect(
      taskProgress({
        completed: false,
        subtasks: [
          { completed: true },
          { completed: true },
          { completed: false },
          { completed: false },
        ],
      }),
    ).toBe(50);
  });
});

describe('numericProgress (§8B)', () => {
  it('320 / 1000 hadiths → 32%', () => {
    expect(numericProgress(320, 1000)).toBe(32);
  });
  it('guards target ≤ 0 and clamps overshoot', () => {
    expect(numericProgress(5, 0)).toBe(0);
    expect(numericProgress(1200, 1000)).toBe(100);
  });
});

describe('hybridProgress (§8D)', () => {
  it('blends dimensions by weight', () => {
    // 80*50 + 60*30 + 100*20 = 4000+1800+2000 = 7800 / 100 = 78
    expect(
      hybridProgress([
        { value: 80, weight: 50 },
        { value: 60, weight: 30 },
        { value: 100, weight: 20 },
      ]),
    ).toBe(78);
  });
  it('validates that weights total 100', () => {
    expect(
      hybridWeightsValid([
        { value: 0, weight: 50 },
        { value: 0, weight: 50 },
      ]),
    ).toBe(true);
    expect(
      hybridWeightsValid([
        { value: 0, weight: 50 },
        { value: 0, weight: 30 },
      ]),
    ).toBe(false);
  });
});

describe('expectedProgress + plannedVsActual (§14)', () => {
  const start = 0;
  const deadline = 100 * DAY;

  it('linear curve: day 40 of 100 → 40%', () => {
    expect(expectedProgress(start, deadline, 40 * DAY)).toBe(40);
  });

  it('clamps before start and after deadline', () => {
    expect(expectedProgress(start, deadline, -DAY)).toBe(0);
    expect(expectedProgress(start, deadline, 200 * DAY)).toBe(100);
  });

  it('spec example: expected 40, actual 31 → delta -9, slightly-behind', () => {
    const r = plannedVsActual({
      startMs: start,
      deadlineMs: deadline,
      nowMs: 40 * DAY,
      actual: 31,
    });
    expect(r.expected).toBe(40);
    expect(r.actual).toBe(31);
    expect(r.delta).toBe(-9);
    expect(r.pace).toBe('slightly-behind');
  });

  it('classifies pace buckets', () => {
    expect(classifyPace(5)).toBe('ahead');
    expect(classifyPace(0)).toBe('on-track');
    expect(classifyPace(-5)).toBe('slightly-behind');
    expect(classifyPace(-20)).toBe('behind');
  });
});
