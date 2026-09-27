import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { GoalWithArea } from '@/db/repositories/goals';
import { addDaysMs, dayKey } from '@/shared/lib/time';
import { Button } from '@/shared/ui/components/Button';
import { Field } from '@/shared/ui/components/Field';
import { Input } from '@/shared/ui/components/Input';

export interface TaskCaptureValues {
  title: string;
  goalId: string | null;
  plannedDate: number | null;
}

export function TaskCapture({
  goals,
  loading,
  onAdd,
}: {
  goals: Pick<GoalWithArea, 'id' | 'title'>[];
  loading: boolean;
  onAdd: (values: TaskCaptureValues) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState('');
  const [goalId, setGoalId] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<TaskCaptureValues | null>(null);
  const submitting = useRef(false);

  const submit = async () => {
    if (!title.trim() || loading || submitting.current) return;
    setError('');
    setSaved(null);
    const plannedDate = date ? new Date(`${date}T00:00:00`).getTime() : null;
    if (plannedDate !== null && (!Number.isFinite(plannedDate) || dayKey(plannedDate) !== date)) {
      setError(t('inbox.invalidDate'));
      return;
    }
    const values = { title: title.trim(), goalId: goalId || null, plannedDate };
    submitting.current = true;
    setBusy(true);
    try {
      await onAdd(values);
      setTitle('');
      setGoalId('');
      setDate('');
      setSaved(values);
    } catch (err) {
      console.error('Task capture failed', err);
      setError(t('common.error'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const destination =
    saved?.plannedDate != null
      ? dayKey(saved.plannedDate) === dayKey()
        ? 'today'
        : 'calendar'
      : saved?.goalId
        ? 'goal'
        : null;

  return (
    <form
      className="capture-panel surface space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={busy || loading} className="space-y-3">
        <Input
          value={title}
          placeholder={t('inbox.placeholder')}
          aria-label={t('inbox.placeholder')}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inbox.assign')} htmlFor="capture-goal">
            <select
              id="capture-goal"
              className="h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              <option value="">{t('tasks.noGoal')}</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('tasks.plannedDate')} htmlFor="capture-date">
            <Input
              id="capture-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={date === dayKey()}
            onClick={() => setDate(dayKey())}
          >
            {t('today.moveToday')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={date === dayKey(addDaysMs(1))}
            onClick={() => setDate(dayKey(addDaysMs(1)))}
          >
            {t('today.moveTomorrow')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={!date}
            onClick={() => setDate('')}
          >
            {t('inbox.noDate')}
          </Button>
          <Button type="submit" className="ms-auto" disabled={busy || loading || !title.trim()}>
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>
        <p className="text-xs text-fg-muted">{t('inbox.captureHelp')}</p>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-fg-muted">
          {saved.plannedDate !== null
            ? t('inbox.addedPlanned', {
                title: saved.title,
                date: new Date(saved.plannedDate).toLocaleDateString(i18n.language),
              })
            : t(saved.goalId ? 'inbox.addedToGoal' : 'inbox.addedToInbox', { title: saved.title })}
          {destination ? (
            <Link
              className="ms-2 text-primary underline underline-offset-2"
              to={destination === 'goal' ? `/goals/${saved.goalId}` : `/${destination}`}
            >
              {t(`inbox.view_${destination}`)}
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
