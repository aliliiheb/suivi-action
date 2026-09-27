import { useWords } from '@/features/workspaces/useWords';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Library,
  Globe,
  GraduationCap,
  Route,
  Award,
  Layers,
  Gem,
  Clock,
  Bookmark,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { LearningItem } from '@/db/repositories/learning';
import { StudioPanel, StudioScene, StudioMeter } from '@/features/workspaces/Studio';
export function LearningHub() {
  const w = useWords(),
    { t } = useTranslation(),
    { repos } = useDb();
  const [goals, setGoals] = useState<GoalWithArea[]>([]),
    [items, setItems] = useState<LearningItem[]>([]),
    [bookmark, setBookmark] = useState<{ surah: number; ayah: number } | null>(null),
    [learned, setLearned] = useState<string[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    void Promise.all([
      repos.goals.list(),
      repos.learning.list(),
      repos.spiritual.read<{ surah: number; ayah: number } | null>('bookmark', null),
      repos.spiritual.read<string[]>('sunnah.learned', []),
    ])
      .then(([g, l, b, s]) => {
        setGoals(g);
        setItems(l);
        setBookmark(b);
        setLearned(s);
      })
      .catch(() => setError(true));
  }, [repos]);
  const learningGoals = goals.filter((g) =>
      ['quran', 'reading', 'study', 'language', 'memorization'].includes(g.goalType),
    ),
    quranGoals = learningGoals.filter((g) => g.goalType === 'quran'),
    quranPercent = quranGoals.length
      ? quranGoals.reduce((s, g) => s + g.progress, 0) / quranGoals.length
      : 0;
  const books = items.filter((i) => i.kind === 'books'),
    pending = items.filter((i) => i.current < i.target).sort((a, b) => a.updatedAt - b.updatedAt),
    resume = bookmark ? `/quran?surah=${bookmark.surah}&ayah=${bookmark.ayah}` : '/quran';
  const categories = [
    [
      '/quran',
      BookOpen,
      w('Le Coran', 'The Quran', 'القرآن'),
      w('Lecture · Hifz · Révision', 'Reading · Hifz · Review', 'قراءة · حفظ · مراجعة'),
    ],
    [
      '/sunnah',
      Library,
      w('Hadiths & Sunna', 'Hadith & Sunnah', 'الحديث والسنة'),
      w('Découvrir · Appliquer', 'Discover · Apply', 'اكتشف · طبّق'),
    ],
    [
      '/learn/skills',
      Globe,
      w('Langues & Compétences', 'Languages & Skills', 'اللغات والمهارات'),
      w('Apprendre · Pratiquer', 'Learn · Practice', 'تعلّم · مارس'),
    ],
    [
      '/learn/books',
      BookOpen,
      w('Livres', 'Books', 'الكتب'),
      w('Lecture · Notes', 'Reading · Notes', 'قراءة · ملاحظات'),
    ],
    [
      '/learn/courses',
      GraduationCap,
      w('Cours', 'Courses', 'الدروس'),
      w('Comprendre · Progresser', 'Understand · Grow', 'افهم · تقدّم'),
    ],
    [
      '/learn/projects',
      Layers,
      w('Projets pratiques', 'Practical projects', 'مشاريع تطبيقية'),
      w('Créer · Expérimenter', 'Create · Experiment', 'أنشئ · جرّب'),
    ],
  ];
  return (
    <div className="atelier-page learning-atelier">
      <header className="atelier-title">
        <div>
          <h1>{w('Le Coran & Apprendre', 'Quran & Learning', 'القرآن والتعلّم')}</h1>
          <p>
            {w(
              'Une seule plateforme pour toute ta quête de savoir.',
              'One home for your entire learning journey.',
              'مساحة واحدة لرحلتك في طلب العلم.',
            )}
          </p>
        </div>
        <Link className="atelier-wide-link" to="/learn/overview">
          {w('Ma bibliothèque →', 'My library →', 'مكتبتي ←')}
        </Link>
      </header>
      {error && <p role="alert">{t('common.error')}</p>}
      <div className="atelier-metrics">
        {[
          [
            BookOpen,
            w('Le Coran', 'Quran', 'القرآن'),
            `${Math.round(quranPercent)} %`,
            w('Moyenne de mes objectifs', 'Average goal progress', 'متوسط تقدم أهدافي'),
          ],
          [
            Library,
            w('Sunna', 'Sunnah', 'السنة'),
            String(learned.length),
            w('Pratiques apprises', 'Practices learned', 'سنن تعلمتها'),
          ],
          [
            Globe,
            w('Langues', 'Languages', 'اللغات'),
            String(learningGoals.filter((g) => g.goalType === 'language').length),
            w('Objectifs', 'Goals', 'أهداف'),
          ],
          [
            BookOpen,
            w('Livres', 'Books', 'الكتب'),
            `${books.filter((i) => i.current >= i.target).length} / ${books.length}`,
            w('Terminés', 'Completed', 'مكتملة'),
          ],
          [
            Clock,
            w('Ressources', 'Resources', 'الموارد'),
            String(pending.length),
            w('En cours', 'In progress', 'قيد التعلم'),
          ],
        ].map(([Icon, label, value, caption]) => {
          const I = Icon as typeof BookOpen;
          return (
            <div className="atelier-metric" key={String(label)}>
              <I />
              <div>
                <small>{String(label)}</small>
                <strong>{String(value)}</strong>
                <small>{String(caption)}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="learning-composition">
        <div className="atelier-stack">
          <StudioScene
            image="learning"
            title={w('Mon Univers du Savoir', 'My Universe of Knowledge', 'عالمي المعرفي')}
            subtitle={w(
              'Apprendre. Comprendre. Appliquer. Grandir.',
              'Learn. Understand. Apply. Grow.',
              'تعلّم. افهم. طبّق. ارتقِ.',
            )}
          >
            <div className="learning-orbits">
              {categories.map(([url, Icon, label, caption]) => {
                const I = Icon as typeof BookOpen;
                return (
                  <Link key={String(url)} to={String(url)}>
                    <I size={22} />
                    <strong>{String(label)}</strong>
                    <small>{String(caption)}</small>
                  </Link>
                );
              })}
            </div>
          </StudioScene>
          <div className="atelier-bottom-three">
            <StudioPanel
              title={w('Mon parcours Coran', 'My Quran journey', 'رحلتي مع القرآن')}
              link="/goals"
            >
              {quranGoals.map((g) => (
                <Link className="atelier-row" key={g.id} to={`/goals/${g.id}`}>
                  <span>
                    {g.title}
                    <StudioMeter value={g.progress} />
                    <small>{Math.round(g.progress)} %</small>
                  </span>
                </Link>
              ))}
              {!quranGoals.length && (
                <Link className="atelier-wide-link" to="/goals">
                  {w(
                    'Créer mon objectif Coran →',
                    'Create my Quran goal →',
                    'إنشاء هدفي القرآني ←',
                  )}
                </Link>
              )}
              <p>
                {w(
                  'La progression suit vos objectifs de mémorisation.',
                  'Progress follows your memorization goals.',
                  'التقدم يتبع أهداف حفظك.',
                )}
              </p>
            </StudioPanel>
            <StudioPanel title={w('Ma session de lecture', 'My reading session', 'جلسة القراءة')}>
              <div className="learning-book-preview" />
              <h3>
                {bookmark
                  ? w(
                      `Sourate ${bookmark.surah} · Verset ${bookmark.ayah}`,
                      `Surah ${bookmark.surah} · Ayah ${bookmark.ayah}`,
                      `سورة ${bookmark.surah} · آية ${bookmark.ayah}`,
                    )
                  : w('Ouvrir le Coran', 'Open the Quran', 'افتح القرآن')}
              </h3>
              <Link className="atelier-wide-link gold" to={resume}>
                <Bookmark size={16} />
                {w('Reprendre la lecture', 'Resume reading', 'استئناف القراءة')}
              </Link>
              <Link className="atelier-row" to="/focus">
                <Clock size={18} />
                {w('Mode concentration', 'Focus mode', 'وضع التركيز')}
              </Link>
            </StudioPanel>
            <StudioPanel
              title={w('Mes apprentissages', 'My learning goals', 'أهداف تعلمي')}
              link="/goals"
            >
              {learningGoals
                .filter((g) => g.goalType !== 'quran')
                .slice(0, 5)
                .map((g) => (
                  <Link className="atelier-row" key={g.id} to={`/goals/${g.id}`}>
                    <span>
                      {g.title}
                      <StudioMeter value={g.progress} />
                      <small>{Math.round(g.progress)} %</small>
                    </span>
                  </Link>
                ))}
              {!learningGoals.length && (
                <p>
                  {w(
                    'Ajoute un objectif pour suivre tes progrès.',
                    'Add a goal to track your progress.',
                    'أضف هدفاً لمتابعة تقدمك.',
                  )}
                </p>
              )}
            </StudioPanel>
          </div>
        </div>
        <aside className="atelier-stack">
          <StudioPanel title={w('À reprendre', 'Continue learning', 'تابع التعلم')}>
            <p>
              {w(
                'Vos ressources en cours, des plus anciennes aux plus récentes.',
                'Your unfinished resources, oldest updates first.',
                'مواردك الجارية، بدءاً بالأقدم تحديثاً.',
              )}
            </p>
            {pending.slice(0, 5).map((i) => (
              <Link className="atelier-row" key={i.id} to={`/learn/${i.kind}`}>
                <BookOpen size={18} />
                <span>
                  {i.title}
                  <small>
                    {i.current} / {i.target}
                  </small>
                  <StudioMeter value={(i.current / i.target) * 100} />
                </span>
              </Link>
            ))}
            {!pending.length && (
              <Link className="atelier-wide-link" to="/learn/paths">
                {w('Commencer un parcours', 'Start a path', 'ابدأ مساراً')}
              </Link>
            )}
          </StudioPanel>
          <StudioPanel title={w('Explorer mes espaces', 'Explore my spaces', 'استكشف مساحاتي')}>
            <div className="atelier-menu">
              {[
                ['paths', Route],
                ['courses', GraduationCap],
                ['skills', Gem],
                ['projects', Layers],
                ['certifications', Award],
              ].map(([kind, Icon]) => {
                const I = Icon as typeof Route;
                return (
                  <Link className="atelier-row" key={String(kind)} to={`/learn/${kind}`}>
                    <I size={19} />
                    {t(`learn.tabs.${kind}`)}
                  </Link>
                );
              })}
              <Link className="atelier-row" to="/notes">
                <BookOpen />
                {w('Notes & Ressources', 'Notes & Resources', 'الملاحظات والموارد')}
              </Link>
            </div>
          </StudioPanel>
          <div className="atelier-quote">
            {w(
              'Le savoir aujourd’hui, un meilleur demain.',
              'Knowledge today, a better tomorrow.',
              'علم اليوم، غد أفضل.',
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
