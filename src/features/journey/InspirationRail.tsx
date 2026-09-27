import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, BookOpen, ArrowRight, Leaf } from 'lucide-react';
export function InspirationRail() {
  const { t } = useTranslation();
  return (
    <aside className="inspiration-rail">
      <Link className="inspiration-card prayer-card" to="/sunnah?entry=duha">
        <h2>
          <Sun size={18} />
          {t('sunnah.daily')}
        </h2>
        <h3>{t('sunnah.entries.duha.title')}</h3>
        <p>{t('sunnah.entries.duha.summary')}</p>
        <span>
          {t('sunnah.discover')}
          <ArrowRight size={14} />
        </span>
      </Link>
      <Link className="inspiration-card hadith-card" to="/sunnah?entry=intention">
        <h2>
          <BookOpen size={18} />
          {t('sunnah.hadith')}
        </h2>
        <p className="arabic-text" dir="rtl" lang="ar">
          إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ
        </p>
        <p>{t('sunnah.entries.intention.summary')}</p>
        <small>Sahih al-Bukhari · 1</small>
        <span>
          {t('sunnah.understand')}
          <ArrowRight size={14} />
        </span>
      </Link>
      <Link className="inspiration-card" to="/adhkar">
        <h2>
          <Leaf size={18} />
          {t('spirit.adhkar')}
        </h2>
        <h3>{t('dailyStudio.pauseTitle')}</h3>
        <p>{t('dailyStudio.pauseText')}</p>
        <span>
          {t('sunnah.discover')}
          <ArrowRight size={14} />
        </span>
      </Link>
      <div className="inspiration-quote">
        <p>{t('dailyStudio.discipline')}</p>
      </div>
    </aside>
  );
}
