import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { Input } from '@/shared/ui/components/Input';
export function GlobalSearch() {
  const { t } = useTranslation();
  const { repos } = useDb();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<{ title: string; to: string; kind: string }[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    void Promise.all([
      repos.goals.list(),
      repos.tasks.listActive(),
      repos.learning.list(),
      repos.workspace.notes(),
    ])
      .then(([g, ta, l, notes]) => {
        if (active)
          setItems([
            ...notes.map((x) => ({
              title: x.title,
              to: `/notes?note=${x.id}`,
              kind: t('nav.notes'),
            })),
            ...g.map((x) => ({ title: x.title, to: `/goals/${x.id}`, kind: t('nav.goals') })),
            ...ta.map((x) => ({
              title: x.title,
              to: `/focus?task=${x.id}`,
              kind: t('home.tasksToday'),
            })),
            ...l.map((x) => ({ title: x.title, to: `/learn/${x.kind}`, kind: t('learn.title') })),
          ]);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [repos, open, t]);
  const results = items
    .filter((item) => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice(0, 20);
  return (
    <>
      <button className="global-search-trigger" onClick={() => setOpen(true)}>
        <Search size={15} />
        <span>{t('command.search')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('command.search')}>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('command.search')}
          />
          <div className="search-results">
            {error ? (
              <p role="alert">{t('common.error')}</p>
            ) : results.length ? (
              results.map((item, index) => (
                <Link key={`${item.to}-${index}`} to={item.to} onClick={() => setOpen(false)}>
                  <span>{item.title}</span>
                  <small>{item.kind}</small>
                </Link>
              ))
            ) : (
              <p>{t('spirit.noResults')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
