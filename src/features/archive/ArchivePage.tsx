import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { ArchiveItem } from '@/db/repositories/archive';
import { useAction } from '@/shared/lib/useAction';
import { Button } from '@/shared/ui/components/Button';

export function ArchivePage() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const { run, busy, error } = useAction();
  const reload = useCallback(
    async () => setItems(await repos.archive.list(archived)),
    [repos, archived],
  );
  useEffect(() => {
    void reload().catch(console.error);
  }, [reload]);
  return (
    <div className="page-stack">
      <h1 className="text-xl font-semibold">{t('data.archiveTitle')}</h1>
      <div className="flex gap-2">
        <Button variant={archived ? 'outline' : 'primary'} onClick={() => setArchived(false)}>
          {t('areas.trashTitle')}
        </Button>
        <Button variant={archived ? 'primary' : 'outline'} onClick={() => setArchived(true)}>
          {t('areas.archivedTitle')}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{t('data.restoreParents')}</p>
      {error ? (
        <p role="alert" className="text-danger">
          {t('common.error')}
        </p>
      ) : null}
      {items.length ? (
        <ul className="archive-list">
          {items.map((item) => (
            <li
              key={`${item.kind}:${item.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-fg-muted">{t(`${item.kind}.title`)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await commit(() => repos.archive.restore(item.kind, item.id));
                    await reload();
                  })
                }
              >
                {t('common.restore')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state grid place-items-center text-center text-fg-muted">
          {t(archived ? 'areas.noArchived' : 'areas.noTrashed')}
        </p>
      )}
    </div>
  );
}
