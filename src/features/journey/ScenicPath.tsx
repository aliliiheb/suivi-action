import { type LucideIcon, Check, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
export interface JourneyStop {
  id: string;
  title: string;
  meta?: string;
  icon?: LucideIcon;
  done?: boolean;
  current?: boolean;
}
/** Accessible buttons over a scenic background; positions and labels come from actual data. */
export function ScenicPath({
  stops,
  onSelect,
  empty,
  currentLabel,
}: {
  stops: JourneyStop[];
  onSelect: (id: string) => void;
  empty?: string;
  currentLabel?: string;
}) {
  const { t } = useTranslation();
  const count = stops.length;
  const points = stops.map((_, i) => ({
    x: ((i + 0.5) / Math.max(1, count)) * 1000,
    y: 55 + Math.cos((i / Math.max(1, count - 1)) * Math.PI * 2) * 24,
  }));
  const line = points
    .map((point, i) => {
      const prev = points[i - 1];
      return prev
        ? `C ${(prev.x + point.x) / 2} ${prev.y} ${(prev.x + point.x) / 2} ${point.y} ${point.x} ${point.y}`
        : `M ${point.x} ${point.y}`;
    })
    .join(' ');
  return (
    <div className="scenic-path-scroll">
      <div
        className="scenic-path"
        style={{ minWidth: count ? Math.max(500, count * 115) : undefined }}
      >
        {count ? (
          <>
            <svg viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true">
              <path d={line} />
            </svg>
            {stops.map((stop, i) => {
              const Icon = stop.icon ?? Flag;
              return (
                <button
                  type="button"
                  key={stop.id}
                  className="scenic-stop"
                  data-current={stop.current}
                  data-done={stop.done}
                  style={{ paddingTop: points[i]!.y - 23 }}
                  onClick={() => onSelect(stop.id)}
                  aria-label={`${stop.title}${stop.meta ? ` · ${stop.meta}` : ''}`}
                >
                  <span className="scenic-stop-icon">
                    <Icon size={26} />
                    {stop.done && <Check size={12} className="stop-check" />}
                  </span>
                  <strong>{stop.title}</strong>
                  {stop.meta && <small>{stop.meta}</small>}
                  {stop.current && <em>{currentLabel ?? t('dailyStudio.next')}</em>}
                </button>
              );
            })}
          </>
        ) : (
          <p className="scenic-path-empty">{empty}</p>
        )}
      </div>
    </div>
  );
}
