import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Leaf, BookOpen, Calendar, Timer, BarChart3, Send } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { dayKey, startOfDayMs, endOfDayMs } from '@/shared/lib/time';
import { StudioPanel, StudioScene, StudioMeter } from '@/features/workspaces/Studio';
import { useWords } from '@/features/workspaces/useWords';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { Button } from '@/shared/ui/components/Button';
export function CoachPage() {
  const w = useWords(),
    { repos, commit } = useDb(),
    date = dayKey();
  const [goals, setGoals] = useState<GoalWithArea[]>([]),
    [tasks, setTasks] = useState<TaskWithContext[]>([]),
    [capacity, setCapacity] = useState(0),
    [focus, setFocus] = useState(0),
    [error, setError] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false),
    [aiError, setAiError] = useState(''),
    [configured, setConfigured] = useState(false),
    [aiModel, setAiModel] = useState('GPT-4.1 mini'),
    [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  useEffect(() => {
    void fetch('/api/coach/status')
      .then((r) => r.json())
      .then((s) => {
        setConfigured(s.configured === true);
        if (s.model) setAiModel(s.model);
      })
      .catch(() => setConfigured(false));
  }, []);
  const [hasCheckin, setHasCheckin] = useState(false);
  const [mood, setMood] = useState({ energy: 50, motivation: 50 }),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState(''),
    [saved, setSaved] = useState(false);
  const reload = useCallback(async () => {
    const [g, t, c, f, m] = await Promise.all([
      repos.goals.list(),
      repos.tasks.listActive(),
      repos.planning.getCapacity(date),
      repos.focus.durationForDay(date),
      repos.workspace.read<{ energy: number; motivation: number } | null>(
        `coach.state.${date}`,
        null,
      ),
    ]);
    setGoals(g);
    setTasks(t);
    setCapacity(c);
    setFocus(f);
    setMood(m ?? { energy: 50, motivation: 50 });
    setHasCheckin(m !== null);
    setLoaded(true);
  }, [repos, date]);
  useEffect(() => {
    void reload().catch(() => setError(true));
  }, [reload]);
  const planned = tasks.filter(
      (t) =>
        !t.completed &&
        t.plannedDate !== null &&
        t.plannedDate >= startOfDayMs(new Date(date + 'T12:00:00')) &&
        t.plannedDate <= endOfDayMs(new Date(date + 'T12:00:00')),
    ),
    estimate = planned.reduce((s, t) => s + (t.estimatedMin ?? 0), 0),
    overdue = tasks.filter(
      (t) => !t.completed && t.deadline !== null && t.deadline < startOfDayMs(new Date()),
    );
  const candidate = [...planned].sort(
    (a, b) =>
      a.priority.localeCompare(b.priority) || (a.deadline ?? Infinity) - (b.deadline ?? Infinity),
  )[0];
  const ask = async (q: string) => {
    if (asking || !q.trim()) return;
    setQuestion(q);
    setAsking(true);
    setAiError('');
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(65000),
        body: JSON.stringify({
          question: q,
          history,
          context: {
            date,
            capacityMin: capacity,
            focusMin: focus,
            remainingEstimateMin: estimate,
            overdueCount: overdue.length,
            goals: goals
              .slice(0, 25)
              .map((g) => ({
                title: g.title,
                progress: g.progress,
                status: g.status,
                deadline: g.deadline,
              })),
            plannedTasks: planned
              .slice(0, 30)
              .map((t) => ({
                title: t.title,
                priority: t.priority,
                estimatedMin: t.estimatedMin,
                deadline: t.deadline,
              })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.answer !== 'string')
        throw new Error(data.error ?? 'connection');
      setAnswer(data.answer);
      setHistory((old) =>
        [
          ...old,
          { role: 'user' as const, content: q },
          { role: 'assistant' as const, content: data.answer },
        ].slice(-6),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setAiError(
        code === 'quota'
          ? w(
              'Le crédit API OpenAI est épuisé. Vérifiez la facturation de votre projet.',
              'OpenAI API quota is exhausted. Check project billing.',
              'رصيد API غير كافٍ. راجع فوترة المشروع.',
            )
          : code === 'authentication'
            ? w(
                'La clé API est refusée. Remplacez-la dans la configuration locale.',
                'API key rejected. Replace it in local configuration.',
                'تم رفض مفتاح API. استبدله في الإعدادات المحلية.',
              )
            : code === 'not_configured'
              ? w(
                  'La clé API n’est pas configurée sur le serveur local.',
                  'API key is not configured on the local server.',
                  'مفتاح API غير مهيأ على الخادم المحلي.',
                )
              : w(
                  'Le Coach est indisponible pour le moment. Réessayez dans quelques instants.',
                  'Coach is temporarily unavailable. Please retry shortly.',
                  'المدرب غير متاح مؤقتاً. حاول بعد قليل.',
                ),
      );
    } finally {
      setAsking(false);
    }
  };
  const saveMood = async () => {
    setBusy(true);
    setError(false);
    try {
      await commit(() => repos.workspace.write(`coach.state.${date}`, mood));
      setSaved(true);
      setHasCheckin(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="atelier-page coach-atelier">
      <header className="atelier-title">
        <div>
          <h1>AI Coach</h1>
          <p>
            {w('Analyse. Anticipe. Adapte.', 'Analyze. Anticipate. Adapt.', 'حلّل. استبق. تكيّف.')}
          </p>
        </div>
        <span className="coach-local">
          {w(
            configured ? 'OpenAI · ' + aiModel : 'OpenAI · connexion à vérifier',
            configured ? 'OpenAI · ' + aiModel : 'OpenAI · check connection',
            configured ? 'OpenAI · ' + aiModel : 'OpenAI · تحقق من الاتصال',
          )}
        </span>
      </header>
      {error && (
        <p role="alert">
          {w(
            'Chargement ou sauvegarde impossible.',
            'Unable to load or save.',
            'تعذر التحميل أو الحفظ.',
          )}
          <button
            onClick={() =>
              void reload()
                .then(() => setError(false))
                .catch(() => setError(true))
            }
          >
            {' '}
            ↻{' '}
          </button>
        </p>
      )}
      <div className="insight-columns">
        <div className="atelier-stack">
          <StudioScene
            image="knowledge"
            title={w(
              'De meilleures décisions, chaque jour.',
              'Better decisions, every day.',
              'قرارات أفضل كل يوم.',
            )}
            subtitle={w(
              'Tout est connecté pour vous aider à avancer.',
              'Everything connects to help you move forward.',
              'كل شيء مترابط لمساعدتك على التقدم.',
            )}
          >
            <div className="learning-orbits">
              {[
                [Target, '/goals', w('Objectifs', 'Goals', 'أهداف')],
                [Leaf, '/habits', w('Habitudes', 'Habits', 'عادات')],
                [BookOpen, '/learn', w('Apprentissage', 'Learning', 'تعلم')],
                [Calendar, '/calendar', w('Planning', 'Planning', 'تخطيط')],
                [Timer, '/focus', w('Focus', 'Focus', 'تركيز')],
                [BarChart3, '/analytics', w('Analytics', 'Analytics', 'إحصائيات')],
              ].map(([Icon, url, label]) => {
                const I = Icon as typeof Target;
                return (
                  <Link key={String(url)} to={String(url)}>
                    <I />
                    <strong>{String(label)}</strong>
                  </Link>
                );
              })}
            </div>
          </StudioScene>
          <div className="atelier-bottom-three">
            <StudioPanel
              title={w('Santé de mes objectifs', 'My goal progress', 'تقدم أهدافي')}
              link="/goals"
            >
              {goals.slice(0, 5).map((g) => (
                <Link className="atelier-row" key={g.id} to={`/goals/${g.id}`}>
                  <span>
                    {g.title}
                    <StudioMeter value={g.progress} />
                    <small>{Math.round(g.progress)}%</small>
                  </span>
                </Link>
              ))}
            </StudioPanel>
            <StudioPanel
              title={w('Échéances à surveiller', 'Deadlines to review', 'مواعيد للمراجعة')}
            >
              {goals
                .filter((g) => g.deadline && g.progress < 100)
                .sort((a, b) => a.deadline! - b.deadline!)
                .slice(0, 4)
                .map((g) => (
                  <Link className="atelier-row" key={g.id} to={`/goals/${g.id}`}>
                    <span>
                      {g.title}
                      <small>{new Date(g.deadline!).toLocaleDateString()}</small>
                    </span>
                  </Link>
                ))}
              <p>
                {w(
                  'Les dates sont celles de vos objectifs. Aucune prévision automatique n’est ajoutée.',
                  'These are your goal deadlines. No automatic forecasts are added.',
                  'هذه مواعيد أهدافك دون توقعات تلقائية.',
                )}
              </p>
            </StudioPanel>
            <StudioPanel title={w('Mon bilan du jour', 'My daily summary', 'ملخص يومي')}>
              <div className="atelier-row">
                {w('Focus enregistré', 'Recorded focus', 'تركيز مسجل')}
                <b>{Math.round(focus)} min</b>
              </div>
              <div className="atelier-row">
                {w('Tâches restantes', 'Remaining tasks', 'مهام متبقية')}
                <b>{planned.length}</b>
              </div>
              <div className="atelier-row">
                {w('Charge estimée', 'Estimated workload', 'العبء المقدر')}
                <b>{estimate} min</b>
              </div>
              <Link className="atelier-wide-link" to="/analytics">
                {w('Analyser mes progrès →', 'Analyze my progress →', 'تحليل تقدمي ←')}
              </Link>
            </StudioPanel>
          </div>
          <StudioPanel title={w('Demande à ton Coach', 'Ask your Coach', 'اسأل مدربك')}>
            <p>
              {w(
                'Discutez avec votre Coach OpenAI. Votre question et un résumé de vos objectifs et tâches du jour sont envoyés à OpenAI. Vos notes privées restent locales.',
                'Chat with your OpenAI Coach. Your question and a summary of your goals and today’s tasks are sent to OpenAI. Private notes stay local.',
                'تحدث مع مدرب OpenAI. يُرسل سؤالك وملخص أهدافك ومهام اليوم إلى OpenAI. تبقى ملاحظاتك الخاصة محلية.',
              )}
            </p>
            <form
              className="coach-question"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <input
                required
                maxLength={4000}
                disabled={asking}
                value={question}
                aria-label={w('Question au coach', 'Coach question', 'سؤال المدرب')}
                placeholder={w(
                  'Ma journée, mes objectifs, mon focus…',
                  'My day, my goals, my focus…',
                  'يومي، أهدافي، تركيزي…',
                )}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button type="submit" disabled={!loaded || asking}>
                <Send size={17} />
                {w('Analyser', 'Analyze', 'حلّل')}
              </Button>
            </form>
            <div className="atelier-tabs">
              {[
                w('Analyse mes objectifs', 'Analyze my goals', 'حلّل أهدافي'),
                w('Optimise ma journée', 'Optimize my day', 'نظّم يومي'),
                w('Aide-moi à me concentrer', 'Help me focus', 'ساعدني على التركيز'),
              ].map((q) => (
                <button key={q} disabled={!loaded || asking} onClick={() => void ask(q)}>
                  {q}
                </button>
              ))}
            </div>
            {asking && (
              <p role="status">{w('Le Coach réfléchit…', 'Coach is thinking…', 'المدرب يفكر…')}</p>
            )}
            {aiError && <p role="alert">{aiError}</p>}
            {history.length > 0 && (
              <button
                className="atelier-wide-link"
                disabled={asking}
                onClick={() => {
                  setHistory([]);
                  setAnswer('');
                  setQuestion('');
                }}
              >
                {w('Nouvelle discussion', 'New conversation', 'محادثة جديدة')}
              </button>
            )}
            {answer && (
              <p className="coach-answer" role="status">
                {answer}
              </p>
            )}
          </StudioPanel>
        </div>
        <aside className="atelier-stack">
          <StudioPanel title={w('Mon état aujourd’hui', 'My state today', 'حالتي اليوم')}>
            <p>
              {w(
                hasCheckin
                  ? 'Votre ressenti enregistré pour aujourd’hui.'
                  : 'Non renseigné : ajustez les curseurs puis enregistrez.',
                'Your self-reported feelings.',
                'تقييمك الشخصي لشعورك.',
              )}
            </p>
            {(['energy', 'motivation'] as const).map((key) => (
              <label className="coach-slider" key={key}>
                {key === 'energy'
                  ? w('Énergie', 'Energy', 'الطاقة')
                  : w('Motivation', 'Motivation', 'الدافعية')}
                <b>{mood[key]}%</b>
                <input
                  type="range"
                  min={0}
                  max={100}
                  disabled={!loaded}
                  value={mood[key]}
                  onChange={(e) => {
                    setMood({ ...mood, [key]: Number(e.target.value) });
                    setSaved(false);
                  }}
                />
              </label>
            ))}
            <Button disabled={!loaded || busy} onClick={() => void saveMood()}>
              {w('Enregistrer mon ressenti', 'Save my check-in', 'حفظ تقييمي')}
            </Button>
            {saved && <p role="status">✓ {w('Enregistré', 'Saved', 'تم الحفظ')}</p>}
          </StudioPanel>
          <StudioPanel title={w('Briefing du jour', 'Daily briefing', 'إحاطة اليوم')}>
            <p>{new Date().toLocaleDateString()}</p>
            <div className="atelier-row">
              {w('Capacité planifiée', 'Planned capacity', 'السعة المخططة')}
              <b>{capacity} min</b>
            </div>
            <div className="atelier-row">
              {w('Sans estimation', 'Without estimate', 'دون تقدير')}
              <b>{planned.filter((t) => t.estimatedMin === null).length}</b>
            </div>
            <Link className="atelier-wide-link" to="/today">
              {w('Organiser ma journée →', 'Organize my day →', 'نظّم يومي ←')}
            </Link>
          </StudioPanel>
          <StudioPanel
            title={w('Que faire maintenant ?', 'What should I do now?', 'ماذا أفعل الآن؟')}
          >
            {candidate ? (
              <>
                <h3>{candidate.title}</h3>
                <p>
                  {w(
                    'Suggestion selon la priorité, puis la date limite.',
                    'Suggested by priority, then deadline.',
                    'اقتراح حسب الأولوية ثم الموعد النهائي.',
                  )}
                </p>
                <Link className="atelier-wide-link gold" to={`/focus?task=${candidate.id}`}>
                  {w('Commencer', 'Start', 'ابدأ')}
                </Link>
              </>
            ) : (
              <Link to="/inbox">
                {w('Ajouter une tâche à planifier →', 'Add a task to plan →', 'أضف مهمة للتخطيط ←')}
              </Link>
            )}
          </StudioPanel>
        </aside>
      </div>
    </div>
  );
}
