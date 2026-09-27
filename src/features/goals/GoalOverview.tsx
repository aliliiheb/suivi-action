import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock,
  Flag,
  List,
  Mountain,
  ArrowRight,
  BookOpen,
  Pencil,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { GoalStep } from '@/db/repositories/steps';
import type { Task } from '@/db/repositories/tasks';
import type { Habit } from '@/db/repositories/habits';
import { useDb } from '@/app/providers/databaseContext';
import { Button } from '@/shared/ui/components/Button';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { formatDuration } from '@/shared/lib/time';
import { goalCover } from './goalPresentation';

export function GoalOverview({
  goal,
  steps,
  tasks,
  onOpen,
  onEdit,
  statisticsOnly = false,
}: {
  goal: GoalWithArea;
  steps: GoalStep[];
  tasks: Task[];
  onOpen: (tab: string) => void;
  onEdit: () => void;
  statisticsOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState('scene');
  const next = steps.find((step) => step.progress < 100);
  const nextTask =
    tasks.find((task) => !task.completed && (!next || task.stepId === next.id)) ??
    tasks.find((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed).length;
  const points = steps.map((_, index) => ({
    x: ((index + 0.5) / steps.length) * 800,
    y: [65, 25, 0, 45, 10][index % 5]! + 31,
  }));
  const path = points
    .map((point, index) => {
      if (!index) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1]!;
      const middle = (previous.x + point.x) / 2;
      return `C ${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
    })
    .join(' ');
  const dated = tasks
    .filter((task) => task.plannedDate !== null)
    .sort((a, b) => a.plannedDate! - b.plannedDate!);
  return (
    <div className="objective-overview">
      {!statisticsOnly && (
        <>
          <section
            className="objective-journey"
            data-view={view}
            aria-label={t('goalStudio.journey')}
          >
            <div className="objective-view-switch">
              {[
                ['scene', Mountain],
                ['list', List],
                ['calendar', CalendarDays],
              ].map(([value, Icon]) => {
                const ViewIcon = Icon as typeof Mountain;
                return (
                  <button
                    type="button"
                    key={String(value)}
                    aria-pressed={view === value}
                    onClick={() => setView(String(value))}
                  >
                    <ViewIcon size={13} />
                    {t(`goalStudio.views.${value}`)}
                  </button>
                );
              })}
            </div>
            {view === 'scene' ? (
              <div className="objective-path-scroll">
                <div
                  className="objective-path"
                  style={{ minWidth: Math.max(480, steps.length * 130) }}
                >
                  {steps.length ? (
                    <>
                      <svg viewBox="0 0 800 150" preserveAspectRatio="none" aria-hidden="true">
                        <path d={path} />
                      </svg>
                      {steps.map((step, index) => (
                        <button
                          type="button"
                          key={step.id}
                          className="objective-milestone"
                          data-current={step.id === next?.id}
                          data-complete={step.progress >= 100}
                          style={{ marginTop: [65, 25, 0, 45, 10][index % 5] }}
                          onClick={() => onOpen('steps')}
                        >
                          <span>{index + 1}</span>
                          <strong>{step.title}</strong>
                          <small>{Math.round(step.progress)}%</small>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="objective-path-empty">
                      <Flag size={30} />
                      <h3>{t('goalStudio.journey')}</h3>
                      <p>{t('steps.empty')}</p>
                      <Button onClick={() => onOpen('steps')}>{t('steps.add')}</Button>
                    </div>
                  )}
                </div>
              </div>
            ) : view === 'list' ? (
              <div className="objective-journey-list">
                {steps.length ? (
                  steps.map((step, index) => (
                    <button type="button" key={step.id} onClick={() => onOpen('steps')}>
                      <span>
                        {index + 1}. {step.title}
                      </span>
                      <strong>{Math.round(step.progress)}%</strong>
                      <ProgressBar value={step.progress} />
                    </button>
                  ))
                ) : (
                  <p>{t('steps.empty')}</p>
                )}
              </div>
            ) : (
              <div className="objective-journey-list">
                {dated.length ? (
                  dated.map((task) => (
                    <button type="button" key={task.id} onClick={() => onOpen('tasks')}>
                      <span>{task.title}</span>
                      <time>{format(task.plannedDate!, 'dd/MM/yyyy')}</time>
                    </button>
                  ))
                ) : (
                  <p>{t('goalStudio.noDates')}</p>
                )}
              </div>
            )}
          </section>
          <div className="objective-next-grid">
            <section className="objective-panel objective-next">
              <h3>
                <Flag size={15} />
                {t('goalStudio.next')}
              </h3>
              <p>{next?.title ?? nextTask?.title ?? t('goalStudio.nextEmpty')}</p>
              <ProgressBar value={next?.progress ?? goal.progress} />
              <Button onClick={() => onOpen(next ? 'steps' : 'tasks')}>
                {t('goalStudio.continue')}
                <ArrowRight size={14} />
              </Button>
            </section>
            <section className="objective-panel">
              <h3>
                <Clock size={14} />
                {t('goalStudio.estimate')}
              </h3>
              <strong className="objective-big-number">
                {nextTask?.estimatedMin
                  ? formatDuration(nextTask.estimatedMin, t('common.minShort'))
                  : '—'}
              </strong>
              <small>{nextTask?.title ?? t('goalStudio.noEstimate')}</small>
            </section>
            <section className="objective-panel">
              <h3>
                <BookOpen size={14} />
                {t('goalStudio.tabs.resources')}
              </h3>
              <button
                className="objective-text-link"
                type="button"
                onClick={() => onOpen('resources')}
              >
                {t('goalStudio.openResources')}
                <ArrowRight size={14} />
              </button>
              {goal.goalType === 'quran' && (
                <Link className="objective-text-link" to="/quran">
                  {t('nav.quran')}
                  <BookOpen size={14} />
                </Link>
              )}
            </section>
          </div>
        </>
      )}
      <div className="objective-summary-grid">
        <section className="objective-panel">
          <h3>{t('goalStudio.detailed')}</h3>
          <div className="objective-stat">
            <span>{t('steps.title')}</span>
            <strong>
              {steps.filter((step) => step.progress >= 100).length} / {steps.length}
            </strong>
            <ProgressBar
              value={
                steps.length
                  ? (steps.filter((step) => step.progress >= 100).length / steps.length) * 100
                  : 0
              }
            />
          </div>
          <div className="objective-stat">
            <span>{t('goalStudio.tabs.tasks')}</span>
            <strong>
              {completed} / {tasks.length}
            </strong>
            <ProgressBar value={tasks.length ? (completed / tasks.length) * 100 : 0} />
          </div>
          <div className="objective-stat">
            <span>{t('goals.invested')}</span>
            <strong>{formatDuration(goal.investedMin, t('common.minShort'))}</strong>
          </div>
          {goal.metrics.map((metric) => (
            <div className="objective-stat" key={metric.id}>
              <span>{t(`goalTypes.metrics.${metric.key}`)}</span>
              <strong>
                {Number(metric.current.toFixed(2))} / {metric.target}
              </strong>
              <ProgressBar value={(metric.current / metric.target) * 100} />
            </div>
          ))}
          <button
            type="button"
            className="objective-text-link"
            onClick={() => onOpen('statistics')}
          >
            {t('goalStudio.editProgress')}
            <ArrowRight size={14} />
          </button>
        </section>
        <section className="objective-panel objective-purpose">
          <h3>{t('goalStudio.why')}</h3>
          <p>{goal.description || t('goalStudio.whyEmpty')}</p>
          <button
            type="button"
            onClick={onEdit}
            style={{
              backgroundImage: `linear-gradient(0deg, #06111bea, transparent), url(${goalCover(goal.goalType)})`,
            }}
          >
            <Pencil size={14} />
            {t('goalStudio.vision')}
          </button>
        </section>
      </div>
    </div>
  );
}

export function GoalNotes({
  goal,
  onSave,
  resources,
}: {
  goal: GoalWithArea;
  onSave: (text: string) => Promise<void>;
  resources: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(goal.description ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const links = Array.from(
    new Set((goal.description ?? '').match(/https?:\/\/[^\s<>"\])]+/g) ?? []),
  );
  return (
    <section className="objective-panel objective-notes">
      <h3>{t(resources ? 'goalStudio.tabs.resources' : 'goalStudio.why')}</h3>
      {resources && (
        <>
          <p>{t('goalStudio.resourceHelp')}</p>
          <ul>
            {links.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage('');
          try {
            await onSave(text);
            setMessage(t('goalStudio.saved'));
          } catch {
            setMessage(t('common.error'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="objective-notes">{t('goalStudio.tabs.notes')}</label>
        <textarea
          id="objective-notes"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder={t('goalStudio.notesHint')}
        />
        <Button type="submit" disabled={busy}>
          {t('common.save')}
        </Button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

export function GoalHabits({ goalId }: { goalId: string }) {
  const { t } = useTranslation();
  const { repos } = useDb();
  const [habits, setHabits] = useState<Habit[] | null>(null);
  useEffect(() => {
    let active = true;
    void repos.habits.list().then((rows) => {
      if (active) setHabits(rows.filter((h) => h.goalId === goalId));
    });
    return () => {
      active = false;
    };
  }, [repos, goalId]);
  return (
    <section className="objective-panel">
      <h3>{t('goalStudio.tabs.habits')}</h3>
      {habits === null ? (
        <p>{t('common.loading')}</p>
      ) : habits.length ? (
        <ul className="objective-habits">
          {habits.map((habit) => (
            <li key={habit.id}>
              <Link to="/habits">
                {habit.title}
                <span>
                  {habit.targetValue} {habit.unit}
                </span>
                <ArrowRight size={14} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('goalStudio.noHabits')}</p>
      )}
      <Link className="objective-text-link" to="/habits">
        {t('goalStudio.manageHabits')}
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}
