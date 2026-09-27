import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Inbox, ArrowRight, Send } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { useAction } from '@/shared/lib/useAction';
import { Input } from '@/shared/ui/components/Input';
import { Button } from '@/shared/ui/components/Button';
export function QuickInbox({ onSaved }: { onSaved?: () => Promise<void> }) {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [rows, setRows] = useState<TaskWithContext[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [loadError, setLoadError] = useState(false);
  const { busy, error, run } = useAction();
  const reload = useCallback(async () => {
    setRows(await repos.tasks.listInbox());
    setLoadError(false);
  }, [repos]);
  useEffect(() => {
    void reload().catch(() => setLoadError(true));
  }, [reload]);
  return (
    <section className="studio-panel quick-inbox">
      <header>
        <h2>
          <Inbox size={17} />
          {t('dailyStudio.inbox')}
        </h2>
        <Link to="/inbox">
          <ArrowRight size={15} />
          <span className="sr-only">{t('nav.inbox')}</span>
        </Link>
      </header>
      <ul>
        {rows.slice(0, 4).map((task) => (
          <li key={task.id}>
            <Link to="/inbox">{task.title}</Link>
          </li>
        ))}
      </ul>
      {!rows.length && !loadError && <p>{t('inbox.emptyTitle')}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void run(async () => {
            await commit(() =>
              repos.tasks.create({
                title: title.trim(),
                ...(date
                  ? {
                      plannedDate: new Date(`${date}T00:00:00`).getTime(),
                      status: 'planned' as const,
                    }
                  : {}),
              }),
            );
            setTitle('');
            await reload();
            await onSaved?.();
          });
        }}
      >
        <Input
          aria-label={t('tasks.placeholder')}
          placeholder={t('tasks.placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div>
          <label>
            {t('tasks.plannedDate')}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || !title.trim()} aria-label={t('tasks.add')}>
            <Send size={15} />
          </Button>
        </div>
      </form>
      {(error || loadError) && (
        <p role="alert">
          {t('common.error')}{' '}
          <Button variant="ghost" size="sm" onClick={() => void run(reload)}>
            {t('common.retry')}
          </Button>
        </p>
      )}
    </section>
  );
}
