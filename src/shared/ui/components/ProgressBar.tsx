import { cn } from '@/shared/lib/cn';

/** Accessible progress bar. `value` is a percentage in [0, 100]. */
export function ProgressBar({
  value,
  className,
  tone = 'primary',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'success';
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'progress-track h-2 w-full overflow-hidden rounded-full bg-surface-2',
        className,
      )}
    >
      <div
        className={cn(
          'progress-fill h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'success' ? 'bg-success' : 'bg-primary',
        )}
        style={{ width: `${v}%` }}
        data-tone={tone}
      />
    </div>
  );
}
