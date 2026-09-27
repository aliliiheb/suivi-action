import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Check, Search } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey } from '@/shared/lib/time';
import { Button } from '@/shared/ui/components/Button';
import adhkar from './data/adhkar.json';
const categories = [...new Set(adhkar.map((item) => item.category))];
export function AdhkarPage() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [day, setDay] = useState(dayKey());
  const category = params.get('category') || 'أذكار الصباح';
  useEffect(() => {
    const timer = setInterval(() => setDay(dayKey()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setReady(false);
    void repos.spiritual
      .read<Record<string, number>>(`adhkar-${day}`, {})
      .then((value) => {
        setCounts(value);
        setReady(true);
      })
      .catch(() => setError(true));
  }, [repos, day]);
  useEffect(() => {
    const id = params.get('id');
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }, [params, ready]);
  const update = async (id: string, value: number) => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const next = { ...counts, [id]: value };
      await commit(() => repos.spiritual.write(`adhkar-${day}`, next));
      setCounts(next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const normalize = (value: string) => value.replace(/[\u064B-\u065F\u0670]/g, '').toLowerCase();
  const items = adhkar.filter(
    (item) =>
      item.category === category &&
      normalize(`${item.text} ${item.reference}`).includes(normalize(query)),
  );
  return (
    <div className="page-stack adhkar-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('spirit.remembrance')}</p>
          <h1>{t('spirit.adhkar')}</h1>
          <p className="text-fg-muted mt-2">{t('spirit.adhkarIntro')}</p>
        </div>
        <span className="learning-badge">345 {t('spirit.entries')}</span>
      </div>
      <div className="adhkar-toolbar">
        <select
          aria-label={t('spirit.category')}
          value={category}
          onChange={(e) => setParams({ category: e.target.value })}
        >
          {categories.map((cat) => (
            <option key={cat}>{cat}</option>
          ))}
        </select>
        <label>
          <Search size={16} />
          <input
            aria-label={t('spirit.searchDhikr')}
            placeholder={t('spirit.searchDhikr')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {t('common.error')}
        </p>
      )}
      <p className="source-note">{t('spirit.importNotice')}</p>
      {!items.length && <p className="empty-state">{t('spirit.noResults')}</p>}
      {items.map((item) => {
        const target = Number(item.count) || null;
        const current = counts[item.id] || 0;
        return (
          <article className="dhikr-reader surface" id={item.id} key={item.id}>
            <div className="dhikr-reader-heading">
              <span lang="ar" dir="rtl">
                {item.category}
              </span>
              <span>{target ? `${target} ×` : t('spirit.unspecified')}</span>
            </div>
            <p className="arabic-text" lang="ar" dir="rtl">
              {item.text}
            </p>
            {item.description && (
              <details>
                <summary>{t('spirit.description')}</summary>
                <p lang="ar" dir="rtl">
                  {item.description}
                </p>
              </details>
            )}
            <footer>
              <span className="text-fg-muted" lang="ar" dir="rtl">
                {item.reference || t('spirit.noReference')}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy || !ready || !current}
                  aria-label={t('spirit.reset')}
                  onClick={() => void update(item.id, 0)}
                >
                  <RotateCcw size={16} />
                </Button>
                <Button
                  disabled={busy || !ready || (!!target && current >= target)}
                  onClick={() => void update(item.id, current + 1)}
                >
                  {target && current >= target ? <Check size={16} /> : null}
                  {target ? `${current} / ${target}` : `${current} +`} · {t('spirit.count')}
                </Button>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
