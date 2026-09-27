import { describe, expect, it } from 'vitest';
import { habitStatistics, isHabitDay } from '@/domain/habits/statistics';

const habit = {
  createdAt: new Date('2026-09-07T00:00:00').getTime(),
  frequency: 'custom',
  daysOfWeek: '[1,3,5]',
  targetValue: 20,
  tracking: 'duration',
};
describe('Habit schedules and streaks', () => {
  it('skips rest days and keeps an unfinished today from breaking the streak', () => {
    const logs = [
      { date: '2026-09-07', value: 20 },
      { date: '2026-09-09', value: 30 },
    ];
    expect(isHabitDay(habit, '2026-09-08')).toBe(false);
    expect(habitStatistics(habit, logs, '2026-09-11')).toMatchObject({
      current: 2,
      best: 2,
      successRate: 100,
    });
  });
  it('breaks a streak on a missed scheduled day and recomputes after correction', () => {
    const logs = [
      { date: '2026-09-07', value: 20 },
      { date: '2026-09-11', value: 20 },
    ];
    expect(habitStatistics(habit, logs, '2026-09-12')).toMatchObject({ current: 1, best: 1 });
    expect(
      habitStatistics(habit, [...logs, { date: '2026-09-09', value: 20 }], '2026-09-12'),
    ).toMatchObject({ current: 3, best: 3 });
  });
  it('does not count a partial quantitative log as a success', () => {
    expect(habitStatistics(habit, [{ date: '2026-09-07', value: 19 }], '2026-09-08')).toMatchObject(
      { current: 0, best: 0, successRate: 0 },
    );
  });
});
