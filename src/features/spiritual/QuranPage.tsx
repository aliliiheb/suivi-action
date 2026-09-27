import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { Button } from '@/shared/ui/components/Button';
import { loadQuran, type Surah } from './quran';

export function QuranPage() {
  const { t, i18n } = useTranslation();
  const { repos, commit } = useDb();
  const [params, setParams] = useSearchParams();
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);
  const [size, setSize] = useState(28);
  const [bookmark, setBookmark] = useState<{ surah: number; ayah: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = Math.max(1, Math.min(114, Number(params.get('surah')) || 1));
  const active = surahs.find((surah) => surah.number === selected);
  useEffect(() => {
    void loadQuran()
      .then(setSurahs)
      .catch(() => setError(true));
    void repos.spiritual
      .read<typeof bookmark>('bookmark', null)
      .then(setBookmark)
      .catch(() => setError(true));
  }, [repos]);
  useEffect(() => {
    const id = params.get('ayah');
    if (active && id) document.getElementById(`ayah-${id}`)?.scrollIntoView({ block: 'center' });
  }, [active, params]);
  const saveBookmark = async (ayah: number) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = { surah: selected, ayah };
      await commit(() => repos.spiritual.write('bookmark', next));
      setBookmark(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  const normalized = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .toLowerCase();
  return (
    <div className="quran-page page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('spirit.offlineLibrary')}</p>
          <h1>{t('spirit.quran')}</h1>
        </div>
        {bookmark && (
          <Button
            variant="outline"
            onClick={() =>
              setParams({ surah: String(bookmark.surah), ayah: String(bookmark.ayah) })
            }
          >
            <Bookmark size={16} />
            {t('spirit.resume')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {t('common.error')}{' '}
          <Button
            onClick={() => {
              setError(false);
              void loadQuran()
                .then(setSurahs)
                .catch(() => setError(true));
            }}
          >
            {t('common.retry')}
          </Button>
        </p>
      )}
      <div className="quran-layout">
        <aside className="surah-sidebar">
          <label className="surah-search">
            <Search size={16} />
            <input
              aria-label={t('spirit.searchSurah')}
              placeholder={t('spirit.searchSurah')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <nav aria-label={t('spirit.surahs')}>
            {surahs
              .filter((s) =>
                normalized(`${s.name} ${s.englishName} ${s.number}`).includes(normalized(search)),
              )
              .map((s) => (
                <button
                  key={s.number}
                  aria-current={s.number === selected ? 'page' : undefined}
                  onClick={() => setParams({ surah: String(s.number) })}
                >
                  <span className="surah-number">{s.number}</span>
                  <span>
                    <strong>{s.englishName}</strong>
                    <small>
                      {s.numberOfAyahs} {t('spirit.verses')}
                    </small>
                  </span>
                  <span className="arabic-text" lang="ar" dir="rtl">
                    {s.name.replace('سُورَةُ ', '')}
                  </span>
                </button>
              ))}
          </nav>
        </aside>
        <section className="mushaf-panel">
          <div className="mushaf-heading">
            <BookOpen size={26} />
            <h2 lang="ar" dir="rtl">
              {active?.name}
            </h2>
            <p>
              {active?.englishName} · {active?.numberOfAyahs} {t('spirit.verses')}
            </p>
            <label>
              {t('spirit.textSize')}
              <input
                aria-label={t('spirit.textSize')}
                type="range"
                min={22}
                max={42}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </label>
          </div>
          {!active ? (
            <p role="status">{t('common.loading')}</p>
          ) : (
            <div className="ayah-list" style={{ fontSize: size }}>
              {active.ayahs.map((ayah) => (
                <article
                  id={`ayah-${ayah.numberInSurah}`}
                  key={ayah.number}
                  className={
                    params.get('ayah') === String(ayah.numberInSurah) ? 'selected-ayah' : ''
                  }
                >
                  <p className="arabic-text" lang="ar" dir="rtl">
                    {ayah.text}
                    <span className="ayah-number">{ayah.numberInSurah.toLocaleString('ar')}</span>
                  </p>
                  <button
                    disabled={saving}
                    aria-label={`${t('spirit.bookmark')} ${ayah.numberInSurah}`}
                    aria-pressed={
                      bookmark?.surah === selected && bookmark.ayah === ayah.numberInSurah
                    }
                    onClick={() => void saveBookmark(ayah.numberInSurah)}
                  >
                    <Bookmark size={15} />
                    <span>
                      {selected}:{ayah.numberInSurah}
                    </span>
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="mushaf-footer">
            <Button
              variant="outline"
              disabled={selected === 1}
              onClick={() => setParams({ surah: String(selected - 1) })}
            >
              <ChevronLeft size={16} />
              {t('spirit.previous')}
            </Button>
            <span>{selected.toLocaleString(i18n.language)} / 114</span>
            <Button
              variant="outline"
              disabled={selected === 114}
              onClick={() => setParams({ surah: String(selected + 1) })}
            >
              {t('spirit.next')}
              <ChevronRight size={16} />
            </Button>
          </div>
          <p className="source-note">
            {t('spirit.quranSource')}{' '}
            <a href="https://alquran.cloud" target="_blank" rel="noreferrer">
              Al Quran Cloud
            </a>{' '}
            · quran-uthmani
          </p>
        </section>
      </div>
    </div>
  );
}
