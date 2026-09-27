import { useEffect, useState } from 'react';

/**
 * Manual advancement control for goals using the "manual" progress method (§8C):
 * a slider + number input to set the percentage by hand. Persists on release /
 * blur / Enter so we don't write on every pixel of drag.
 */
export function ManualProgressControl({
  value,
  label,
  onSet,
}: {
  value: number;
  label: string;
  onSet: (value: number) => Promise<void>;
}) {
  const [local, setLocal] = useState(Math.round(value));

  useEffect(() => {
    setLocal(Math.round(value));
  }, [value]);

  const persist = (raw: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(raw || 0)));
    setLocal(clamped);
    void onSet(clamped);
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={local}
            aria-label={label}
            onChange={(e) => setLocal(Number(e.target.value))}
            onBlur={() => persist(local)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') persist(local);
            }}
            className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-end text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-sm text-fg-muted">%</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => persist(local)}
        onKeyUp={() => persist(local)}
        className="w-full accent-primary"
        style={{ accentColor: 'hsl(var(--primary))' }}
      />
    </div>
  );
}
