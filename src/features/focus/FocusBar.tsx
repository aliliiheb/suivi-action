import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { FocusSession } from '@/db/repositories/focus';
import { advanceTimer, timerText } from '@/domain/focus/timer';

/** Lives in the shell so navigation never stops the timer or its persistence. */
export function FocusBar() {
  const { repos, commit } = useDb();
  const { t } = useTranslation();
  const [session, setSession] = useState<FocusSession>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = () => {
      void repos.focus.active().then((value) => {
        if (active) {
          setSession(value);
          setNow(Date.now());
        }
      });
    };
    refresh();
    const display = window.setInterval(refresh, 1000);
    const persist = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void repos.focus
        .active()
        .then(async (current) => {
          if (current?.state === 'running') await commit(() => repos.focus.tick());
        })
        .catch(console.error)
        .finally(() => {
          pending = false;
        });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(display);
      window.clearInterval(persist);
    };
  }, [repos, commit]);
  if (!session) return null;
  const elapsed = advanceTimer(session, now).elapsedMs;
  return (
    <Link className="me-auto rounded-md bg-primary/10 px-3 py-1 text-sm text-primary" to="/focus">
      {t(
        session.recovered
          ? 'focus.recoveredShort'
          : session.state === 'running'
            ? 'focus.running'
            : 'focus.paused',
      )}{' '}
      ·{' '}
      <span dir="ltr">
        {timerText(
          session.targetMin === null ? elapsed : Math.min(elapsed, session.targetMin * 60000),
        )}
      </span>
    </Link>
  );
}
