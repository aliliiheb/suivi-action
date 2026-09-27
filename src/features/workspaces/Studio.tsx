import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
export function StudioPanel({
  title,
  children,
  link,
  label,
}: {
  title: string;
  children: ReactNode;
  link?: string;
  label?: string;
}) {
  return (
    <section className="atelier-panel">
      <header>
        <h2>{title}</h2>
        {link && <Link to={link}>{label ?? '→'}</Link>}
      </header>
      {children}
    </section>
  );
}
export function StudioScene({
  image,
  title,
  subtitle,
  children,
}: {
  image: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="atelier-scene" style={{ backgroundImage: `url(/art/${image}.png)` }}>
      <div className="atelier-scene-caption">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
export function StudioMeter({ value }: { value: number }) {
  return (
    <progress
      className="atelier-meter"
      max={100}
      value={Math.max(0, Math.min(100, value))}
      aria-label={`${Math.round(value)} %`}
    />
  );
}
