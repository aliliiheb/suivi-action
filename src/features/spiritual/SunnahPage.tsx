import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  Sunrise,
  Sunset,
  Moon,
  BedDouble,
  House,
  BookOpen,
  Leaf,
  Bookmark,
  Check,
  Feather,
  Library,
  ArrowRight,
  CalendarDays,
  Heart,
  Utensils,
  Search,
} from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { useAction } from '@/shared/lib/useAction';
import { dayKey } from '@/shared/lib/time';
import { ProgressRing } from '@/shared/ui/components/ProgressRing';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { ScenicPath } from '@/features/journey/ScenicPath';
import { SUNNAH_ENTRIES, SUNNAH_PERIODS, SUNNAH_TOPICS, type SunnahId } from './sunnah';

const periodIcons = [BedDouble, Sunrise, Sun, House, Sunset, Moon, BedDouble];
const topicIcons = [House, Leaf, Utensils, Heart, Feather, BedDouble];
export function SunnahPage() {
  const { t, i18n } = useTranslation();
  const { repos, commit } = useDb();
  const [params, setParams] = useSearchParams();
  const selected =
    SUNNAH_ENTRIES.find((entry) => entry.id === params.get('entry')) ?? SUNNAH_ENTRIES[0];
  const [today, setToday] = useState(dayKey());
  const [learned, setLearned] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { busy, error, run } = useAction();
  const reload = useCallback(async () => {
    const [l, a, b, r] = await Promise.all([
      repos.spiritual.read<string[]>('sunnah.learned', []),
      repos.spiritual.read<string[]>(`sunnah.applied.${today}`, []),
      repos.spiritual.read<string[]>('sunnah.bookmarks', []),
      repos.spiritual.read<string>(`sunnah.reflection.${today}`, ''),
    ]);
    setLearned(l);
    setApplied(a);
    setBookmarks(b);
    setReflection(r);
    setLoading(false);
    setLoadError(false);
  }, [repos, today]);
  useEffect(() => {
    void reload().catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(dayKey()), 30000);
    return () => clearInterval(timer);
  }, []);
  const toggle = (key: string, id: SunnahId) =>
    run(async () => {
      await commit(async () => {
        const list = await repos.spiritual.read<string[]>(key, []);
        await repos.spiritual.write(
          key,
          list.includes(id) ? list.filter((value) => value !== id) : [...list, id],
        );
      });
      await reload();
    });
  const select = (id: string) => {
    setParams({ entry: id }, { replace: true });
  };
  const learnedCount = SUNNAH_ENTRIES.filter((entry) => learned.includes(entry.id)).length;
  const appliedCount = SUNNAH_ENTRIES.filter((entry) => applied.includes(entry.id)).length;
  const percent = (learnedCount / SUNNAH_ENTRIES.length) * 100;
  const filtered = SUNNAH_ENTRIES.filter(
    (entry) =>
      (filter === 'all' ||
        filter === entry.topic ||
        filter === entry.period ||
        (filter === 'bookmarks' && bookmarks.includes(entry.id))) &&
      `${t(`sunnah.entries.${entry.id}.title`)} ${t(`sunnah.entries.${entry.id}.summary`)}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const openLibrary = (value = 'all') => {
    setFilter(value);
    setLibraryOpen(true);
  };
  return (
    <div className="sunnah-studio">
      <section className="sunnah-hero">
        <div className="sunnah-hero-top">
          <div>
            <h1 className="arabic-text" lang="ar" dir="rtl">
              يوم مع الرسول ﷺ
            </h1>
            <p>{t('sunnah.subtitle')}</p>
          </div>
          <div className="sunnah-day-stats studio-panel">
            <p>
              <CalendarDays size={16} />
              {new Date(`${today}T12:00:00`).toLocaleDateString(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <div>
              <section>
                <h2>{t('sunnah.path')}</h2>
                <div className="sunnah-counts">
                  <span>
                    <strong>{learnedCount}</strong>
                    {t('sunnah.learned')}
                  </span>
                  <span>
                    <strong>{appliedCount}</strong>
                    {t('sunnah.applied')}
                  </span>
                  <span>
                    <strong>{SUNNAH_ENTRIES.length - learnedCount}</strong>
                    {t('sunnah.toLearn')}
                  </span>
                </div>
              </section>
              <ProgressRing value={percent} label={t('sunnah.learned')} />
            </div>
          </div>
        </div>
        <ScenicPath
          currentLabel={t('sunnah.selectedPeriod')}
          stops={SUNNAH_PERIODS.map((period, i) => ({
            id: period,
            title: t(`sunnah.periods.${period}`),
            meta: t(`sunnah.periodAr.${period}`),
            icon: periodIcons[i],
            current: period === selected.period,
          }))}
          onSelect={openLibrary}
        />
      </section>
      {(error || loadError) && (
        <p role="alert">
          {t('common.error')}
          <Button onClick={() => void run(reload)}>{t('common.retry')}</Button>
        </p>
      )}
      {loading && <p role="status">{t('common.loading')}</p>}
      <nav className="sunnah-launchers" aria-label={t('sunnah.explore')}>
        <button type="button" onClick={() => select('duha')} data-active={selected.id === 'duha'}>
          <Sun size={30} />
          <strong>{t('sunnah.daily')}</strong>
          <small>{t('sunnah.entries.duha.title')}</small>
          <span>
            {t('sunnah.discover')}
            <ArrowRight size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => select('intention')}
          data-active={selected.id === 'intention'}
        >
          <BookOpen size={30} />
          <strong>{t('sunnah.hadith')}</strong>
          <small>{t('sunnah.entries.intention.title')}</small>
          <span>
            {t('sunnah.understand')}
            <ArrowRight size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => select('rawatib')}
          data-active={selected.id === 'rawatib'}
        >
          <House size={30} />
          <strong>{t('sunnah.rawatib')}</strong>
          <small>{t('sunnah.prayers')}</small>
          <span>
            {t('sunnah.details')}
            <ArrowRight size={14} />
          </span>
        </button>
        <Link to="/adhkar">
          <Leaf size={30} />
          <strong>{t('spirit.adhkar')}</strong>
          <small>{t('sunnah.adhkarHint')}</small>
          <span>
            {t('sunnah.open')}
            <ArrowRight size={14} />
          </span>
        </Link>
        <button type="button" onClick={() => openLibrary()}>
          <Library size={30} />
          <strong>{t('sunnah.library')}</strong>
          <small>{t('sunnah.byTopic')}</small>
          <span>
            {t('sunnah.explore')}
            <ArrowRight size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setReflectionOpen(true);
          }}
        >
          <Feather size={30} />
          <strong>{t('sunnah.reflection')}</strong>
          <small>{t('sunnah.reflectionHint')}</small>
          <span>
            {t('dailyStudio.start')}
            <ArrowRight size={14} />
          </span>
        </button>
      </nav>
      <div className="sunnah-content">
        <article className="studio-panel sunnah-feature">
          <header>
            <h2>
              <Sun size={18} />
              {t('sunnah.selected')}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy || loading}
              onClick={() => void toggle('sunnah.bookmarks', selected.id)}
              aria-label={t('sunnah.bookmark')}
              aria-pressed={bookmarks.includes(selected.id)}
            >
              <Bookmark
                size={17}
                fill={bookmarks.includes(selected.id) ? 'currentColor' : 'none'}
              />
            </Button>
          </header>
          <div className="sunnah-feature-intro">
            <img src="/art/goal-quran.png" alt="" />
            <div>
              <h3>{t(`sunnah.entries.${selected.id}.title`)}</h3>
              <p>{t(`sunnah.entries.${selected.id}.summary`)}</p>
              <a href={selected.url} target="_blank" rel="noopener noreferrer">
                {selected.source}
                <ArrowRight size={13} />
              </a>
            </div>
          </div>
          <div className="sunnah-application">
            <h3>{t('sunnah.applyHow')}</h3>
            <p>{t(`sunnah.entries.${selected.id}.application`)}</p>
            <small>{t('sunnah.summaryNote')}</small>
          </div>
          <div className="sunnah-track-actions">
            <Button
              variant="outline"
              disabled={busy || loading}
              aria-pressed={learned.includes(selected.id)}
              onClick={() => void toggle('sunnah.learned', selected.id)}
            >
              <BookOpen size={15} />
              {t(learned.includes(selected.id) ? 'sunnah.isLearned' : 'sunnah.markLearned')}
            </Button>
            <Button
              disabled={busy || loading}
              aria-pressed={applied.includes(selected.id)}
              onClick={() => void toggle(`sunnah.applied.${today}`, selected.id)}
            >
              <Check size={15} />
              {t(applied.includes(selected.id) ? 'sunnah.isApplied' : 'sunnah.markApplied')}
            </Button>
          </div>
        </article>
        <article className="studio-panel sunnah-hadith">
          <header>
            <h2>
              <BookOpen size={18} />
              {t('sunnah.hadith')}
            </h2>
          </header>
          <p className="arabic-text" dir="rtl" lang="ar">
            إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ
          </p>
          <p>{t('sunnah.entries.intention.summary')}</p>
          <dl>
            <dt>{t('sunnah.source')}</dt>
            <dd>Sahih al-Bukhari · 1</dd>
            <dt>{t('sunnah.narrator')}</dt>
            <dd>{t('sunnah.umar')}</dd>
          </dl>
          <a
            className="studio-text-link"
            href="https://sunnah.com/bukhari:1"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('sunnah.viewSource')}
            <ArrowRight size={14} />
          </a>
          <h3>{t('sunnah.applyHow')}</h3>
          <p>{t('sunnah.entries.intention.application')}</p>
          <Button variant="outline" onClick={() => select('intention')}>
            {t('sunnah.understand')}
          </Button>
        </article>
        <section className="studio-panel sunnah-prayers">
          <header>
            <h2>
              <House size={18} />
              {t('sunnah.prayers')}
            </h2>
          </header>
          {['fajr', 'dhuhr', 'maghrib', 'isha'].map((key) => (
            <div key={key}>
              <span>{t(`sunnah.prayerNames.${key}`)}</span>
              <strong>{t(`sunnah.prayerCounts.${key}`)}</strong>
            </div>
          ))}
          <p>{t('sunnah.prayerNote')}</p>
          <a href="https://sunnah.com/tirmidhi:415" target="_blank" rel="noopener noreferrer">
            Jamiʿ at-Tirmidhi · 415
          </a>
          <Button variant="outline" onClick={() => select('rawatib')}>
            {t('sunnah.details')}
          </Button>
        </section>
        <aside className="sunnah-side">
          <section className="studio-panel">
            <h2>{t('sunnah.progress')}</h2>
            <div className="sunnah-progress-row">
              <span>{t('sunnah.learned')}</span>
              <strong>
                {learnedCount}/{SUNNAH_ENTRIES.length}
              </strong>
              <ProgressBar value={percent} />
            </div>
            <div className="sunnah-progress-row">
              <span>{t('sunnah.applied')}</span>
              <strong>
                {appliedCount}/{SUNNAH_ENTRIES.length}
              </strong>
              <ProgressBar value={(appliedCount / SUNNAH_ENTRIES.length) * 100} />
            </div>
            <button
              className="studio-text-link"
              type="button"
              onClick={() => openLibrary('bookmarks')}
            >
              {t('sunnah.bookmarks')}
              <Bookmark size={14} />
            </button>
          </section>
          <section className="studio-panel">
            <h2>{t('sunnah.byTopic')}</h2>
            <div className="sunnah-topics">
              {SUNNAH_TOPICS.map((topic, i) => {
                const Icon = topicIcons[i]!;
                return (
                  <button type="button" key={topic} onClick={() => openLibrary(topic)}>
                    <Icon size={21} />
                    <span>{t(`sunnah.topics.${topic}`)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
      <footer className="studio-day-footer">
        <p>{t('sunnah.footer')}</p>
        <Button
          onClick={() => {
            const next = SUNNAH_ENTRIES.find((entry) => !learned.includes(entry.id));
            if (next) select(next.id);
            else openLibrary();
          }}
        >
          <Leaf size={17} />
          {t('sunnah.learnNew')}
        </Button>
      </footer>
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent title={t('sunnah.library')} className="sunnah-library-dialog">
          <label className="sunnah-search">
            <Search size={17} />
            <Input
              aria-label={t('sunnah.search')}
              placeholder={t('sunnah.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="studio-filters">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {t('goalStudio.statuses.all')}
            </button>
            {SUNNAH_TOPICS.map((topic) => (
              <button
                type="button"
                key={topic}
                aria-pressed={filter === topic}
                onClick={() => setFilter(topic)}
              >
                {t(`sunnah.topics.${topic}`)}
              </button>
            ))}
          </div>
          <ul className="sunnah-library-list">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    select(entry.id);
                    setLibraryOpen(false);
                  }}
                >
                  <strong>{t(`sunnah.entries.${entry.id}.title`)}</strong>
                  <p>{t(`sunnah.entries.${entry.id}.summary`)}</p>
                  <small>{entry.source}</small>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && <p>{t('sunnah.noMatch')}</p>}
        </DialogContent>
      </Dialog>
      <Dialog open={reflectionOpen} onOpenChange={setReflectionOpen}>
        <DialogContent title={t('sunnah.reflection')}>
          <form
            className="sunnah-reflection"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await commit(() => repos.spiritual.write(`sunnah.reflection.${today}`, reflection));
                setSaved(true);
              });
            }}
          >
            <label htmlFor="sunnah-reflection">{t('sunnah.reflectionQuestion')}</label>
            <textarea
              id="sunnah-reflection"
              rows={7}
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setSaved(false);
              }}
            />
            <Button type="submit" disabled={busy}>
              {t('common.save')}
            </Button>
            {saved && <p role="status">{t('goalStudio.saved')}</p>}
            {error && <p role="alert">{t('common.error')}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
