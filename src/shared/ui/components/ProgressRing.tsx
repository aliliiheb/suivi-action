/** Presentation only: renders the existing percentage without changing its calculation. */
export function ProgressRing({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-ring"
      data-complete={percent >= 100}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="progress-ring-orbit" cx="60" cy="60" r="59" />
        <circle className="progress-ring-track" cx="60" cy="60" r="51" />
        <circle
          className="progress-ring-value"
          cx="60"
          cy="60"
          r="51"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
        />
      </svg>
      <span className="progress-ring-number" aria-hidden="true">
        {Math.round(percent)}
        <small>%</small>
      </span>
    </div>
  );
}
