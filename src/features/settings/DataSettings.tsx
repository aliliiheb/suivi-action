import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import { initRuntime, replaceStoredDatabase, readSafetyBackup } from '@/db/runtime';
import { exportJson, exportCsv, prepareRestore } from '@/db/backup';
import { dayKey } from '@/shared/lib/time';
import { useAction } from '@/shared/lib/useAction';
import { Button } from '@/shared/ui/components/Button';

function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DataSettings() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const { busy, error, run } = useAction();
  const [pending, setPending] = useState<{ bytes: Uint8Array; count: number }>();
  const [blocked, setBlocked] = useState(false);
  const [safetyAvailable, setSafetyAvailable] = useState(false);
  useEffect(() => {
    void readSafetyBackup()
      .then((bytes) => setSafetyAvailable(!!bytes))
      .catch(console.error);
  }, []);
  const backup = async (format: 'sqlite' | 'json' | 'tasks' | 'focus_sessions' | 'habit_logs') => {
    await commit(async () => undefined);
    const handle = await initRuntime();
    if (format === 'sqlite')
      download(
        new Uint8Array(handle.export()),
        `PROGRESS-${dayKey()}.sqlite`,
        'application/vnd.sqlite3',
      );
    else if (format === 'json')
      download(
        JSON.stringify(exportJson(handle), null, 2),
        `PROGRESS-${dayKey()}.json`,
        'application/json',
      );
    else
      download(
        exportCsv(handle, format),
        `PROGRESS-${format}-${dayKey()}.csv`,
        'text/csv;charset=utf-8',
      );
  };
  const restore = async () => {
    if (!pending) return;
    if (await repos.focus.active()) {
      setBlocked(true);
      return;
    }
    await backup('sqlite');
    await replaceStoredDatabase(pending.bytes);
    window.location.reload();
  };
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        {t('data.title')}
      </h2>
      <div className="surface space-y-4">
        <p className="text-sm text-fg-muted">{t('data.explanation')}</p>
        <div className="data-exports">
          {(['sqlite', 'json', 'tasks', 'focus_sessions', 'habit_logs'] as const).map((format) => (
            <Button
              key={format}
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => backup(format))}
            >
              {t(`data.${format}`)}
            </Button>
          ))}
        </div>
        {safetyAvailable ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const bytes = await readSafetyBackup();
                if (bytes)
                  download(
                    new Uint8Array(bytes),
                    `PROGRESS-safety-${dayKey()}.sqlite`,
                    'application/vnd.sqlite3',
                  );
              })
            }
          >
            {t('data.safety')}
          </Button>
        ) : null}
        <label className="data-import block text-sm font-medium">
          {t('data.import')}
          <input
            className="mt-2 block w-full text-sm"
            type="file"
            accept=".sqlite,.db,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPending(undefined);
              setBlocked(false);
              if (!file) return;
              void run(async () => {
                if (file.size > 100 * 1024 * 1024) throw new Error('Backup too large');
                const input = file.name.toLowerCase().endsWith('.json')
                  ? await file.text()
                  : new Uint8Array(await file.arrayBuffer());
                setPending(await prepareRestore(input));
              });
            }}
          />
        </label>
        {pending ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm">{t('data.confirmRestore', { count: pending.count })}</p>
            <Button disabled={busy} onClick={() => void run(restore)}>
              {t('data.restore')}
            </Button>
          </div>
        ) : null}
        {blocked ? (
          <p role="alert" className="text-sm text-danger">
            {t('data.stopFocus')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {t('data.error')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
