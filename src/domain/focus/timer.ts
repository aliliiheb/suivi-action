export interface TimerState {
  state: string;
  elapsedMs: number;
  pausedMs: number;
  lastTickAt: number;
}

/** Wall-clock deltas avoid interval drift; a backwards clock never subtracts time. */
export function advanceTimer(timer: TimerState, now: number): TimerState {
  const delta = Math.max(0, now - timer.lastTickAt);
  return {
    state: timer.state,
    elapsedMs: timer.elapsedMs + (timer.state === 'running' ? delta : 0),
    pausedMs: timer.pausedMs + (timer.state === 'paused' ? delta : 0),
    lastTickAt: Math.max(now, timer.lastTickAt),
  };
}

export function timerText(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
