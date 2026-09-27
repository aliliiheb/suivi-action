import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { Field } from '@/shared/ui/components/Field';
import { PRIORITY, type Priority, type ProgressMethodName } from '@/domain/enums';
import {
  GOAL_TYPES,
  GOAL_METRICS,
  GoalValidationError,
  validateMetrics,
  type GoalType,
  type MetricInput,
} from '@/domain/goals/goalTypes';
import type { LifeArea } from '@/db/repositories/lifeAreas';
import type { GoalWithArea } from '@/db/repositories/goals';
import { dayKey } from '@/shared/lib/time';

export interface GoalFormValues {
  title: string;
  areaId: string | null;
  priority: Priority;
  progressMethod: ProgressMethodName;
  startDate: number | null;
  deadline: number | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  goalType: GoalType;
  metrics: MetricInput[];
}
type Draft = {
  key: string;
  target: string;
  current: string;
  source: 'manual' | 'focus';
};
const selectClass =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const fromMetrics = (metrics: MetricInput[]): Draft[] =>
  metrics.map((metric) => ({
    key: metric.key,
    source: metric.source,
    target: String(metric.target),
    current: String(metric.current),
  }));
const defaults = (type: GoalType): Draft[] =>
  GOAL_METRICS[type]
    .filter((metric) => metric.required || metric.key === 'sport_km')
    .map((metric) => ({
      key: metric.key,
      target: '',
      current: '0',
      source: 'manual',
    }));

export function GoalFormDialog({
  open,
  onOpenChange,
  areas,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: LifeArea[];
  initial: GoalWithArea | null;
  onSubmit: (values: GoalFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState('');
  const [priority, setPriority] = useState<Priority>('p3');
  const [method, setMethod] = useState<ProgressMethodName>('tasks');
  const [type, setType] = useState<GoalType>('custom');
  const [metrics, setMetrics] = useState<Draft[]>([]);
  const [start, setStart] = useState('');
  const [deadline, setDeadline] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('0');
  const [unit, setUnit] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setAreaId(initial?.areaId ?? '');
    setPriority((initial?.priority as Priority) ?? 'p3');
    setMethod((initial?.progressMethod as ProgressMethodName) ?? 'tasks');
    setType((initial?.goalType as GoalType) ?? 'custom');
    setMetrics(
      fromMetrics(
        (initial?.metrics ?? []).map((metric) => ({
          ...metric,
          source: metric.source as 'manual' | 'focus',
        })),
      ),
    );
    setStart(initial?.startDate != null ? dayKey(initial.startDate) : '');
    setDeadline(initial?.deadline != null ? dayKey(initial.deadline) : '');
    setTarget(initial?.targetValue != null ? String(initial.targetValue) : '');
    setCurrent(String(initial?.currentValue ?? 0));
    setUnit(initial?.unit ?? '');
    setErrors({});
    setBusy(false);
  }, [open, initial]);
  const chooseType = (next: GoalType) => {
    if (next === type) return;
    setType(next);
    setErrors({});
    setMetrics(
      next === initial?.goalType
        ? fromMetrics(
            initial.metrics.map((metric) => ({
              ...metric,
              source: metric.source as 'manual' | 'focus',
            })),
          )
        : defaults(next),
    );
    setMethod(
      next === 'custom'
        ? initial?.goalType === 'custom'
          ? (initial.progressMethod as ProgressMethodName)
          : 'tasks'
        : 'metrics',
    );
  };
  const patchMetric = (key: string, patch: Partial<Draft>) => {
    setMetrics((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors({});
  };
  const errorFor = (field: string) => errors[field];
  const submit = async () => {
    if (busy) return;
    const values = metrics.map((metric) => ({
      ...metric,
      target: Number(metric.target),
      current: Number(metric.current),
    }));
    try {
      if (!title.trim()) throw new GoalValidationError('title', 'required');
      for (const metric of metrics)
        if (metric.source === 'manual' && !metric.current.trim())
          throw new GoalValidationError(`${metric.key}.current`, 'required');
      validateMetrics(type, values);
      if (type === 'custom' && method === 'numeric') {
        if (!target || !Number.isFinite(Number(target)) || Number(target) <= 0)
          throw new GoalValidationError('target', 'positive');
        if (!current || !Number.isFinite(Number(current)) || Number(current) < 0)
          throw new GoalValidationError('current', 'nonnegative');
      }
      if (start && deadline && start > deadline) throw new GoalValidationError('deadline', 'dates');
      setBusy(true);
      setErrors({});
      await onSubmit({
        title: title.trim(),
        areaId: areaId || null,
        priority,
        goalType: type,
        metrics: values,
        progressMethod: type === 'custom' ? method : 'metrics',
        startDate: start ? new Date(`${start}T00:00:00`).getTime() : null,
        deadline: deadline ? new Date(`${deadline}T23:59:59.999`).getTime() : null,
        targetValue: type === 'custom' && method === 'numeric' ? Number(target) : null,
        currentValue: type === 'custom' && method === 'numeric' ? Number(current) : null,
        unit: type === 'custom' && method === 'numeric' ? unit.trim() || null : null,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof GoalValidationError)
        setErrors({ [err.field]: t(`goalTypes.errors.${err.reason}`) });
      else {
        console.error(err);
        setErrors({ form: t('common.error') });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent
        title={initial ? t('common.edit') : t('goals.new')}
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
      >
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('goalTypes.choose')}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {GOAL_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={type === option}
                    onClick={() => chooseType(option)}
                    className={`rounded-lg border px-3 py-2 text-start text-sm transition-colors ${type === option ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface hover:bg-surface-2'}`}
                  >
                    {t(`goalTypes.types.${option}`)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-fg-muted">{t(`goalTypes.descriptions.${type}`)}</p>
            </fieldset>
            {initial && type !== initial.goalType ? (
              <p className="rounded-md bg-primary/10 p-3 text-sm" role="status">
                {t('goalTypes.changeType')}
              </p>
            ) : null}
            <Field label={t('goals.titleLabel')} htmlFor="goal-title" error={errorFor('title')}>
              <Input
                id="goal-title"
                value={title}
                autoFocus
                aria-invalid={!!errorFor('title')}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(`goalTypes.examples.${type}`)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('goals.areaLabel')} htmlFor="goal-area">
                <select
                  id="goal-area"
                  className={selectClass}
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                >
                  <option value="">{t('goals.noArea')}</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('goals.priorityLabel')} htmlFor="goal-priority">
                <select
                  id="goal-priority"
                  className={selectClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITY.map((value) => (
                    <option key={value} value={value}>
                      {t(`tasks.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {type !== 'custom' ? (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">{t('goalTypes.measures')}</h3>
                <p className="text-xs text-fg-muted">{t('goalTypes.measureHelp')}</p>
                {GOAL_METRICS[type].map((definition) => {
                  const row = metrics.find((metric) => metric.key === definition.key);
                  const label = t(`goalTypes.metrics.${definition.key}`);
                  return (
                    <div
                      key={definition.key}
                      className="space-y-3 rounded-lg border border-border bg-surface-2/50 p-3"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={!!row}
                          disabled={definition.required}
                          onChange={(e) => {
                            setMetrics(
                              e.target.checked
                                ? [
                                    ...metrics,
                                    {
                                      key: definition.key,
                                      target: '',
                                      current: '0',
                                      source: 'manual',
                                    },
                                  ]
                                : metrics.filter((metric) => metric.key !== definition.key),
                            );
                            setErrors({});
                          }}
                        />
                        {label}
                        <span className="text-xs font-normal text-fg-muted">
                          {t(definition.required ? 'goalTypes.required' : 'goalTypes.optional')}
                        </span>
                      </label>
                      {row ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            {(['target', 'current'] as const).map((field) => (
                              <Field
                                key={field}
                                label={t(`goalTypes.${field}`)}
                                htmlFor={`${row.key}-${field}`}
                                error={errorFor(`${row.key}.${field}`)}
                              >
                                <Input
                                  id={`${row.key}-${field}`}
                                  type="number"
                                  step={!definition.integer ? 'any' : '1'}
                                  min={field === 'current' ? '0' : '0.01'}
                                  value={row[field]}
                                  disabled={field === 'current' && row.source === 'focus'}
                                  aria-label={`${label} — ${t(`goalTypes.${field}`)}`}
                                  aria-invalid={!!errorFor(`${row.key}.${field}`)}
                                  onChange={(e) =>
                                    patchMetric(row.key, { [field]: e.target.value })
                                  }
                                />
                              </Field>
                            ))}
                          </div>
                          {definition.focus ? (
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={row.source === 'focus'}
                                onChange={(e) =>
                                  patchMetric(row.key, {
                                    source: e.target.checked ? 'focus' : 'manual',
                                  })
                                }
                              />
                              {t('goalTypes.autoFocus')}
                            </label>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : (
              <>
                <Field label={t('goals.methodLabel')} htmlFor="goal-method">
                  <select
                    id="goal-method"
                    className={selectClass}
                    value={method}
                    onChange={(e) => setMethod(e.target.value as ProgressMethodName)}
                  >
                    {(['tasks', 'numeric', 'manual'] as const).map((value) => (
                      <option key={value} value={value}>
                        {t(`goals.method_${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                {method === 'numeric' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Field
                      label={t('goals.targetLabel')}
                      htmlFor="goal-target"
                      error={errors.target}
                    >
                      <Input
                        id="goal-target"
                        type="number"
                        step="any"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      />
                    </Field>
                    <Field
                      label={t('goals.currentLabel')}
                      htmlFor="goal-current"
                      error={errors.current}
                    >
                      <Input
                        id="goal-current"
                        type="number"
                        step="any"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                      />
                    </Field>
                    <Field label={t('goals.unitLabel')} htmlFor="goal-unit">
                      <Input
                        id="goal-unit"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('goalTypes.startDate')} htmlFor="goal-start">
                <Input
                  id="goal-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field
                label={t('goals.deadlineLabel')}
                htmlFor="goal-deadline"
                error={errors.deadline}
              >
                <Input
                  id="goal-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </div>
            {Object.entries(errors)
              .filter(([key]) => ['form', 'type', 'method', 'metrics'].includes(key))
              .map(([key, value]) => (
                <p key={key} role="alert" className="text-sm text-danger">
                  {value}
                </p>
              ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {t(initial ? 'common.save' : 'common.create')}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
