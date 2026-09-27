import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Sunrise, Moon, ArrowRight } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey } from '@/shared/lib/time';
import { fetchDailyAyah, loadQuran, type DailyAyah } from './quran';
import adhkar from './data/adhkar.json';

// Shared request prevents duplicate remote calls when React StrictMode mounts twice.
let dailyRequest: { day: string; value: Promise<DailyAyah> } | undefined;
export function VerseOfDay({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [ayah, setAyah] = useState<DailyAyah | null>(null);
  const [failed, setFailed] = useState(false);
  const today = dayKey();
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const cached = await repos.spiritual.read<{ day: string; ayah: DailyAyah } | null>(
        'daily-ayah',
        null,
      );
      if (cached?.day === today) {
        if (alive) setAyah(cached.ayah);
        return;
      }
      if (!dailyRequest || dailyRequest.day !== today)
        dailyRequest = { day: today, value: fetchDailyAyah() };
      let next: DailyAyah;
      try {
        next = await dailyRequest.value;
      } catch {
        // A stable, sourced local verse keeps the home useful without the network.
        if (cached) {
          if (alive) setAyah(cached.ayah);
          return;
        }
        const surahs = await loadQuran();
        const surah = surahs[0]!;
        next = { ...surah.ayahs[0]!, surah };
      }
      if (!alive) return;
      setAyah(next);
      await commit(() => repos.spiritual.write('daily-ayah', { day: today, ayah: next }));
    };
    void run().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [repos, commit, today]);
  return (
    <Link
      className={compact ? 'daily-verse compact-verse' : 'daily-verse sacred-card'}
      to={ayah ? `/quran?surah=${ayah.surah.number}&ayah=${ayah.numberInSurah}` : '/quran'}
    >
      {!compact && (
        <span className="sacred-label">
          <BookOpen size={17} />
          {t('spirit.verseDay')}
        </span>
      )}
      <p className="arabic-text" lang="ar" dir="rtl">
        {ayah?.text ?? t(failed ? 'common.error' : 'common.loading')}
      </p>
      <small>
        {ayah
          ? `${ayah.surah.name} · ${ayah.surah.number}:${ayah.numberInSurah}`
          : t('spirit.quran')}
      </small>
    </Link>
  );
}
export function AdhkarHomeCards() {
  const { t } = useTranslation();
  const evening = new Date().getHours() >= 16;
  const category = evening ? 'أذكار المساء' : 'أذكار الصباح';
  const list = adhkar.filter((item) => item.category === category && item.text.length < 550);
  const index = Math.floor(Date.now() / 86400000) % list.length;
  const item = list[index] ?? adhkar[0]!;
  return (
    <aside className="sacred-stack">
      <Link
        className="sacred-card illustrated-card morning-card"
        to={`/adhkar?category=${encodeURIComponent(category)}`}
      >
        <span className="sacred-label">
          {evening ? <Moon size={18} /> : <Sunrise size={18} />}
          {t(evening ? 'spirit.evening' : 'spirit.morning')}
        </span>
        <h2>{t('spirit.moment')}</h2>
        <p>{t('spirit.invite')}</p>
        <span className="sacred-action">
          {t('spirit.begin')}
          <ArrowRight size={14} />
        </span>
      </Link>
      <Link
        className="sacred-card dhikr-card"
        to={`/adhkar?category=${encodeURIComponent(category)}&id=${item.id}`}
      >
        <span className="sacred-label">
          <BookOpen size={17} />
          {t('spirit.dhikrDay')}
        </span>
        <p className="arabic-text" lang="ar" dir="rtl">
          {item.text}
        </p>
        <small lang="ar" dir="rtl">
          {item.reference || t('spirit.imported')}
        </small>
        <span className="sacred-action">
          {t('spirit.readCount')}
          <ArrowRight size={14} />
        </span>
      </Link>
      <Link className="sacred-card illustrated-card quran-card" to="/quran">
        <span className="sacred-label">
          <BookOpen size={18} />
          {t('spirit.quran')}
        </span>
        <h2>{t('spirit.quranInvite')}</h2>
        <p>{t('spirit.offlineLibrary')}</p>
        <span className="sacred-action">
          {t('spirit.openQuran')}
          <ArrowRight size={14} />
        </span>
      </Link>
    </aside>
  );
}
