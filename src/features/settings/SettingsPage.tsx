import { useWords } from '@/features/workspaces/useWords';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserRound,
  Palette,
  Database,
  Target,
  BookOpen,
  Calendar,
  Shield,
  Leaf,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/app/stores/theme';
import { THEME, LANGUAGE, type Language } from '@/domain/enums';
import { useDb } from '@/app/providers/databaseContext';
import type { PersonalSpace } from '@/db/repositories/workspace';
import type { LifeArea } from '@/db/repositories/lifeAreas';
import { Button } from '@/shared/ui/components/Button';
import { StudioPanel, StudioScene } from '@/features/workspaces/Studio';
import { DataSettings } from './DataSettings';
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const w = useWords();
  const { repos, commit } = useDb();
  const theme = useThemeStore((s) => s.theme),
    setTheme = useThemeStore((s) => s.setTheme);
  const [profile, setProfile] = useState<PersonalSpace>({ name: '', intention: '', visions: {} }),
    [areas, setAreas] = useState<LifeArea[]>([]),
    [active, setActive] = useState(0),
    [horizon, setHorizon] = useState('1'),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    void Promise.all([
      repos.workspace.read<PersonalSpace>('profile', { name: '', intention: '', visions: {} }),
      repos.lifeAreas.list(),
      repos.goals.list(),
    ])
      .then(([p, a, g]) => {
        setProfile(p);
        setAreas(a);
        setActive(g.filter((x) => x.status === 'active').length);
        setLoaded(true);
      })
      .catch(() => setError(true));
  }, [repos]);
  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      await commit(() => repos.workspace.write('profile', profile));
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const edit = (p: PersonalSpace) => {
    setProfile(p);
    setSaved(false);
  };
  const tabs = [
    ['profile', w('Profil', 'Profile', 'الملف الشخصي')],
    ['life', w('Mon Système de Vie', 'My life system', 'نظام حياتي')],
    ['appearance', w('Apparence', 'Appearance', 'المظهر')],
    ['vision', w('Ma Vision', 'My vision', 'رؤيتي')],
    ['data', w('Données', 'Data', 'البيانات')],
  ];
  return (
    <div className="atelier-page space-atelier">
      <header className="atelier-title">
        <div>
          <h1>{w('Mon Espace', 'My Space', 'مساحتي')}</h1>
          <p>
            {w(
              'Configure ton espace autour de ta vie.',
              'Build your space around your life.',
              'نظّم مساحتك حول حياتك.',
            )}
          </p>
        </div>
        <div className="atelier-quote">
          {w(
            'Organise ton monde intérieur, pour mieux construire ton monde extérieur.',
            'Organize your inner world to shape your outer world.',
            'نظّم عالمك الداخلي لتبني عالمك الخارجي.',
          )}
        </div>
      </header>
      <nav className="atelier-tabs">
        {tabs.map(([id, label]) => (
          <a key={id} href={`#space-${id}`}>
            {label}
          </a>
        ))}
      </nav>
      {error && <p role="alert">{t('common.error')}</p>}
      <div className="atelier-three space-composition">
        <section id="space-profile">
          <StudioPanel title={w('Mon identité', 'My identity', 'هويتي')}>
            <div className="atelier-profile">
              <UserRound size={44} />
              <strong>{profile.name || w('Bienvenue', 'Welcome', 'مرحباً')}</strong>
              <p>
                {profile.intention ||
                  w(
                    'Un pas vers une meilleure version de toi.',
                    'One step towards a better you.',
                    'خطوة نحو نسخة أفضل منك.',
                  )}
              </p>
            </div>
            <form
              className="atelier-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                {w('Nom affiché', 'Display name', 'الاسم')}
                <input
                  maxLength={80}
                  disabled={!loaded}
                  value={profile.name}
                  onChange={(e) => edit({ ...profile, name: e.target.value })}
                />
              </label>
              <label>
                {w('Mon intention', 'My intention', 'نيتي')}
                <textarea
                  rows={2}
                  maxLength={500}
                  disabled={!loaded}
                  value={profile.intention}
                  onChange={(e) => edit({ ...profile, intention: e.target.value })}
                />
              </label>
              <div className="atelier-row">
                {w('Objectifs actifs', 'Active goals', 'أهداف نشطة')}
                <b>{active}</b>
              </div>
              <div className="atelier-row">
                {w('Fuseau de cet appareil', 'Device time zone', 'المنطقة الزمنية للجهاز')}
                <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
              </div>
              <Button disabled={!loaded || busy} type="submit">
                {t('common.save')}
              </Button>
              {saved && <p role="status">{w('Enregistré', 'Saved', 'تم الحفظ')} ✓</p>}
            </form>
          </StudioPanel>
        </section>
        <StudioScene
          image="identity"
          title={w(
            'Une vie alignée, un avenir clair.',
            'An aligned life, a clear future.',
            'حياة متوازنة، مستقبل واضح.',
          )}
          subtitle={
            profile.name || w('Ton espace personnel', 'Your personal space', 'مساحتك الشخصية')
          }
        >
          <div className="atelier-orbit-links">
            {[
              [UserRound, '#space-profile', w('Identité', 'Identity', 'الهوية')],
              [Leaf, '#space-life', w('Système de vie', 'Life system', 'نظام الحياة')],
              [Palette, '#space-appearance', w('Apparence', 'Appearance', 'المظهر')],
              [Database, '#space-data', w('Données', 'Data', 'البيانات')],
            ].map(([Icon, href, label]) => {
              const I = Icon as typeof UserRound;
              return (
                <a key={String(href)} href={String(href)}>
                  <I />
                  {String(label)}
                </a>
              );
            })}
          </div>
        </StudioScene>
        <section id="space-vision">
          <StudioPanel title={w('Ma Vision', 'My Vision', 'رؤيتي')}>
            <div className="atelier-tabs">
              {['1', '3', '5', '10'].map((y) => (
                <button key={y} aria-pressed={horizon === y} onClick={() => setHorizon(y)}>
                  {y} {w(y === '1' ? 'an' : 'ans', 'yr', 'سنة')}
                </button>
              ))}
            </div>
            <form
              className="atelier-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                {w(
                  'La vie que je veux construire',
                  'The life I want to build',
                  'الحياة التي أريد بناءها',
                )}
                <textarea
                  rows={5}
                  disabled={!loaded}
                  maxLength={2000}
                  value={profile.visions[horizon] ?? ''}
                  onChange={(e) =>
                    edit({ ...profile, visions: { ...profile.visions, [horizon]: e.target.value } })
                  }
                />
              </label>
              <Button disabled={!loaded || busy} type="submit">
                {t('common.save')}
              </Button>
            </form>
            <h3>{w('Mes domaines de vie', 'My life areas', 'مجالات حياتي')}</h3>
            {areas.slice(0, 6).map((a, i) => (
              <Link className="atelier-row" to="/areas" key={a.id}>
                <span className="atelier-dot" style={{ background: a.color ?? '#d9b86d' }} />
                {i + 1}. {a.name}
              </Link>
            ))}
          </StudioPanel>
        </section>
      </div>
      <div className="atelier-bottom-three">
        <section id="space-life">
          <StudioPanel
            title={w('Mon Système de Vie', 'My Life System', 'نظام حياتي')}
            link="/areas"
            label={w('Gérer →', 'Manage →', 'إدارة ←')}
          >
            <p>
              {w(
                'Les domaines qui comptent pour toi.',
                'The areas that matter to you.',
                'المجالات المهمة لك.',
              )}
            </p>
            <div className="atelier-tiles">
              {areas.map((a) => (
                <Link key={a.id} to="/areas">
                  <Leaf style={{ color: a.color ?? undefined }} />
                  {a.name}
                </Link>
              ))}
            </div>
            <Link className="atelier-wide-link" to="/areas">
              + {w('Ajouter un domaine', 'Add an area', 'إضافة مجال')}
            </Link>
          </StudioPanel>
        </section>
        <section id="space-appearance">
          <StudioPanel title={w('Apparence & Langue', 'Appearance & Language', 'المظهر واللغة')}>
            <div className="atelier-preview" />
            <h3>{t('settings.theme')}</h3>
            <div className="atelier-tabs">
              {THEME.map((mode) => (
                <button key={mode} aria-pressed={theme === mode} onClick={() => setTheme(mode)}>
                  {t(`settings.theme${mode[0]!.toUpperCase() + mode.slice(1)}`)}
                </button>
              ))}
            </div>
            <label className="atelier-form">
              {t('settings.language')}
              <select
                value={i18n.language.split('-')[0]}
                onChange={(e) => void i18n.changeLanguage(e.target.value as Language)}
              >
                {LANGUAGE.map((l) => (
                  <option key={l} value={l}>
                    {{ fr: 'Français', en: 'English', ar: 'العربية' }[l]}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {w(
                'Le thème reste accessible dans la barre de navigation. Les animations respectent les préférences de votre appareil.',
                'Theme is also available in the navigation bar. Animations respect your device preferences.',
                'المظهر متاح أيضاً في شريط التنقل. الحركات تحترم إعدادات جهازك.',
              )}
            </p>
          </StudioPanel>
        </section>
        <StudioPanel title={w('Mes espaces de travail', 'My workspaces', 'مساحات عملي')}>
          <div className="atelier-menu">
            {[
              [Target, '/goals', w('Mes objectifs', 'My goals', 'أهدافي')],
              [Calendar, '/calendar', w('Mon planning', 'My planning', 'تخطيطي')],
              [BookOpen, '/learn', w('Le Coran & Apprendre', 'Quran & Learning', 'القرآن والتعلم')],
              [
                Shield,
                '/archive',
                w('Archives & Corbeille', 'Archive & Trash', 'الأرشيف والمحذوفات'),
              ],
            ].map(([Icon, url, label]) => {
              const I = Icon as typeof Target;
              return (
                <Link className="atelier-row" key={String(url)} to={String(url)}>
                  <I size={20} />
                  {String(label)} →
                </Link>
              );
            })}
          </div>
          <p>
            {w(
              'Vos données restent enregistrées localement. Exportez une sauvegarde pour les conserver sur un autre appareil.',
              'Your data is saved locally. Export a backup to keep a copy on another device.',
              'تُحفظ بياناتك محلياً. صدّر نسخة احتياطية للاحتفاظ بها على جهاز آخر.',
            )}
          </p>
        </StudioPanel>
      </div>
      <section id="space-data" className="atelier-panel">
        <DataSettings />
      </section>
    </div>
  );
}
