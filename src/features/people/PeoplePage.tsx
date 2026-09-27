import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, Star, Search, TreePine, MapPin } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { StudioPanel, StudioScene } from '@/features/workspaces/Studio';
import { useWords } from '@/features/workspaces/useWords';
import { Button } from '@/shared/ui/components/Button';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { PEOPLE, type Person } from './people';
interface ReadingState {
  read: string[];
  favorites: string[];
  reflections: Record<string, string>;
}
export function PeoplePage() {
  const w = useWords(),
    { repos, commit } = useDb(),
    location = useLocation();
  const [state, setState] = useState<ReadingState>({ read: [], favorites: [], reflections: {} }),
    [selected, setSelected] = useState<Person>(PEOPLE[0]),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState('all'),
    [view, setView] = useState('categories'),
    [city, setCity] = useState(''),
    [reflection, setReflection] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [quiz, setQuiz] = useState(false),
    [answer, setAnswer] = useState('');
  useEffect(
    () => setGroup(location.pathname === '/scholars' ? 'scholars' : 'all'),
    [location.pathname],
  );
  useEffect(() => {
    void repos.workspace
      .read<ReadingState>('people.reading', { read: [], favorites: [], reflections: {} })
      .then((s) => {
        setState(s);
        setLoaded(true);
      })
      .catch(() => setError(true));
  }, [repos]);
  const groups = [
    ['all', w('Tous', 'All', 'الكل')],
    ['companions', w('Les Compagnons', 'Companions', 'الصحابة')],
    ['tabiin', w('Les Tabi’in', 'Successors', 'التابعون')],
    ['scholars', w('Les Savants', 'Scholars', 'العلماء')],
  ];
  const visible = PEOPLE.filter(
    (p) =>
      (group === 'all' || p.group === group) &&
      (!city || p.city === city) &&
      (view !== 'favorites' || state.favorites.includes(p.id)) &&
      `${p.name} ${p.arabic} ${p.city}`.toLowerCase().includes(query.toLowerCase()),
  );
  const show = (p: Person) => {
    setSelected(p);
    setReflection(state.reflections[p.id] ?? '');
    setOpen(true);
    setQuiz(false);
    setAnswer('');
  };
  const save = async (next: ReadingState) => {
    setBusy(true);
    setError(false);
    try {
      await commit(() => repos.workspace.write('people.reading', next));
      setState(next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (key: 'read' | 'favorites') =>
    void save({
      ...state,
      [key]: state[key].includes(selected.id)
        ? state[key].filter((id) => id !== selected.id)
        : [...state[key], selected.id],
    });
  const daily =
    PEOPLE[
      Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000) % PEOPLE.length
    ]!;
  return (
    <div className="atelier-page people-atelier">
      <header className="atelier-title">
        <div>
          <h1>
            {w('Compagnons & Savants', 'Companions & Scholars', 'الصحابة والتابعون والعلماء')}
          </h1>
          <p>
            {w(
              'Des générations de savoir, des leçons pour aujourd’hui.',
              'Generations of knowledge, lessons for today.',
              'أجيال من العلم ودروس لليوم.',
            )}
          </p>
        </div>
        <label className="atelier-search">
          <Search size={17} />
          <input
            value={query}
            aria-label={w('Rechercher une personnalité', 'Search people', 'ابحث عن شخصية')}
            placeholder={w('Une personnalité, une ville…', 'A person, a city…', 'شخصية، مدينة…')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>
      {error && (
        <p role="alert">
          {w(
            'Impossible de charger ou enregistrer.',
            'Unable to load or save.',
            'تعذر التحميل أو الحفظ.',
          )}
        </p>
      )}
      <div className="people-hero">
        <StudioScene
          image="knowledge-tree"
          title={w(
            'Une chaîne de savoir et de foi',
            'A chain of knowledge and faith',
            'سلسلة من العلم والإيمان',
          )}
          subtitle={w('À travers les générations', 'Across generations', 'عبر الأجيال')}
        >
          <div className="tree-generations">
            {[...groups.slice(1)].reverse().map(([id, label]) => (
              <button
                key={id}
                aria-pressed={group === id}
                onClick={() => {
                  setGroup(id!);
                  setCity('');
                }}
              >
                <TreePine size={21} />
                {label}
              </button>
            ))}
          </div>
          <div className="people-counts">
            <span>
              <b>{PEOPLE.length}</b>
              {w('fiches disponibles', 'available profiles', 'بطاقات متاحة')}
            </span>
            <span>
              <b>{state.read.length}</b>
              {w('fiches lues', 'profiles read', 'بطاقات مقروءة')}
            </span>
            <span>
              <b>{state.favorites.length}</b>
              {w('favoris', 'favorites', 'مفضلة')}
            </span>
          </div>
        </StudioScene>
        <aside className="atelier-stack">
          <StudioPanel title={w('Personnalité du jour', 'Person of the day', 'شخصية اليوم')}>
            <div className="people-feature">
              <h2 lang="ar" dir="rtl">
                {daily.arabic}
              </h2>
              <h3>{daily.name}</h3>
              <p>{w(daily.text[0], daily.text[1], daily.text[2])}</p>
              <Button onClick={() => show(daily)}>
                <BookOpen size={18} />
                {w('Découvrir son histoire', 'Read the profile', 'اكتشف سيرته')}
              </Button>
            </div>
          </StudioPanel>
          <StudioPanel
            title={w('Apprendre et mettre en pratique', 'Learn and apply', 'تعلّم وطبّق')}
          >
            <p>
              {w(
                'Après une lecture, note une idée concrète à appliquer dans ta journée.',
                'After reading, write one practical idea for your day.',
                'بعد القراءة، دوّن فكرة عملية لتطبيقها في يومك.',
              )}
            </p>
            <button className="atelier-wide-link" onClick={() => show(daily)}>
              {w('Écrire ma réflexion →', 'Write my reflection →', 'اكتب تأملي ←')}
            </button>
          </StudioPanel>
          <div className="atelier-quote">
            {w(
              'Des vies à découvrir, des leçons à méditer.',
              'Lives to discover, lessons to reflect on.',
              'سير نكتشفها ودروس نتأملها.',
            )}
          </div>
        </aside>
      </div>
      <div className="atelier-toolbar">
        <div className="atelier-tabs">
          {[
            ['categories', w('Explorer par catégorie', 'Browse categories', 'تصفح الفئات')],
            ['timeline', w('Frise historique', 'Historical timeline', 'التسلسل التاريخي')],
            ['cities', w('Par ville', 'By city', 'حسب المدينة')],
            ['favorites', w('Mes favoris', 'My favorites', 'مفضلتي')],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={view === id} onClick={() => setView(id!)}>
              {label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => show(PEOPLE[Math.floor(Math.random() * PEOPLE.length)]!)}
        >
          {w('Une fiche au hasard', 'Random profile', 'بطاقة عشوائية')}
        </Button>
      </div>
      <div className="atelier-tabs">
        {groups.map(([id, label]) => (
          <button key={id} aria-pressed={group === id} onClick={() => setGroup(id!)}>
            {label}
          </button>
        ))}
        {city && <button onClick={() => setCity('')}>{city} ×</button>}
      </div>
      {view === 'cities' && (
        <div className="people-cities">
          {[...new Set(PEOPLE.map((p) => p.city))].map((c) => (
            <button key={c} aria-pressed={city === c} onClick={() => setCity(city === c ? '' : c)}>
              <MapPin />
              {c}
            </button>
          ))}
        </div>
      )}
      <div className={`people-library ${view === 'timeline' ? 'people-timeline' : ''}`}>
        {[...visible]
          .sort((a, b) => (view === 'timeline' ? Number(a.period) - Number(b.period) : 0))
          .map((p, i) => (
            <button className="people-card" key={p.id} onClick={() => show(p)}>
              <div
                className="people-card-cover"
                style={{ backgroundImage: `url(/art/${i % 2 ? 'goal-study' : 'sanctuary'}.png)` }}
              >
                <span>
                  {p.period}
                  {w('e siècle H.', ' AH century', ' هـ')}
                </span>
              </div>
              <h3 lang="ar" dir="rtl">
                {p.arabic}
              </h3>
              <strong>{p.name}</strong>
              <small>
                {groups.find((g) => g[0] === p.group)?.[1]} · {p.city}
              </small>
              <span className="people-read">
                {state.read.includes(p.id) ? '✓' : ''} {state.favorites.includes(p.id) ? '★' : ''}
              </span>
            </button>
          ))}
      </div>
      {!visible.length && (
        <div className="atelier-panel">
          {w(
            'Aucune fiche ne correspond à ces filtres.',
            'No profiles match these filters.',
            'لا توجد بطاقات تطابق هذه الفلاتر.',
          )}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent title={selected.name}>
          <div className="atelier-form">
            <h2 className="people-arabic" lang="ar" dir="rtl">
              {selected.arabic}
            </h2>
            <p>{w(selected.text[0], selected.text[1], selected.text[2])}</p>
            <a
              className="atelier-wide-link"
              href={selected.source}
              target="_blank"
              rel="noreferrer"
            >
              {selected.reference} ↗
            </a>
            <div className="atelier-actions">
              <Button
                disabled={!loaded || busy}
                aria-pressed={state.read.includes(selected.id)}
                onClick={() => toggle('read')}
              >
                {w('Marquer comme lu', 'Mark as read', 'تحديد كمقروء')}{' '}
                {state.read.includes(selected.id) ? '✓' : ''}
              </Button>
              <Button
                variant="outline"
                disabled={!loaded || busy}
                aria-pressed={state.favorites.includes(selected.id)}
                onClick={() => toggle('favorites')}
              >
                <Star size={15} />
                {w('Favori', 'Favorite', 'مفضلة')}
              </Button>
            </div>
            <label>
              {w('Ma réflexion personnelle', 'My personal reflection', 'تأملي الشخصي')}
              <textarea
                rows={3}
                value={reflection}
                maxLength={3000}
                onChange={(e) => setReflection(e.target.value)}
              />
            </label>
            <Button
              disabled={!loaded || busy}
              onClick={() =>
                void save({
                  ...state,
                  reflections: { ...state.reflections, [selected.id]: reflection },
                })
              }
            >
              {w('Enregistrer ma réflexion', 'Save reflection', 'حفظ التأمل')}
            </Button>
            {error && (
              <p role="alert">
                {w(
                  'Sauvegarde impossible. Réessayez.',
                  'Unable to save. Retry.',
                  'تعذر الحفظ. حاول مجدداً.',
                )}
              </p>
            )}
            <button className="atelier-wide-link" onClick={() => setQuiz(!quiz)}>
              {w('Tester ma mémoire', 'Test my memory', 'اختبر ذاكرتي')}
            </button>
            {quiz && (
              <fieldset>
                <legend>
                  {w(
                    'À quelle génération appartient cette personnalité ?',
                    'Which generation does this person belong to?',
                    'إلى أي جيل تنتمي هذه الشخصية؟',
                  )}
                </legend>
                {groups.slice(1).map(([id, label]) => (
                  <button className="atelier-wide-link" key={id} onClick={() => setAnswer(id!)}>
                    {label}
                  </button>
                ))}
                {answer && (
                  <p role="status">
                    {answer === selected.group
                      ? w('Bonne réponse ✓', 'Correct ✓', 'إجابة صحيحة ✓')
                      : w(
                          'Relisez sa catégorie, puis réessayez.',
                          'Review the category and try again.',
                          'راجع الفئة ثم حاول مجدداً.',
                        )}
                  </p>
                )}
              </fieldset>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
