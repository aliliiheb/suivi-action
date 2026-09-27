import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '@/app/providers/databaseContext';
import type { Habit } from '@/db/repositories/habits';
import type { HabitTracking } from '@/domain/enums';
import { useAction } from '@/shared/lib/useAction';
import { Input } from '@/shared/ui/components/Input';
import { Button } from '@/shared/ui/components/Button';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';

export function HabitForm({
  habit,
  goals,
  areas,
  onClose,
  onSaved,
}: {
  habit: Habit | null;
  goals: { id: string; title: string }[];
  areas: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { repos, commit } = useDb();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [description, setDescription] = useState(habit?.description ?? '');
  const [goalId, setGoalId] = useState(habit?.goalId ?? '');
  const [areaId, setAreaId] = useState(habit?.areaId ?? '');
  const [tracking, setTracking] = useState<HabitTracking>(
    (habit?.tracking as HabitTracking) ?? 'boolean',
  );
  const [target, setTarget] = useState(String(habit?.targetValue ?? 1));
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [custom, setCustom] = useState(habit?.frequency !== 'daily' && !!habit);
  const [days, setDays] = useState<number[]>(JSON.parse(habit?.daysOfWeek ?? '[1,2,3,4,5]'));
  const { busy, error, run } = useAction();
  const select = 'mt-1 h-10 w-full rounded-md border border-border bg-surface px-2';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        title={t(habit ? 'habits.edit' : 'habits.new')}
        className="max-h-[90vh] overflow-y-auto"
      >
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await commit(() =>
                repos.habits.save(
                  {
                    title,
                    description,
                    goalId: goalId || null,
                    areaId: areaId || null,
                    tracking,
                    targetValue: tracking === 'boolean' ? 1 : Number(target),
                    unit,
                    frequency: custom ? 'custom' : 'daily',
                    daysOfWeek: custom ? JSON.stringify(days) : null,
                  },
                  habit?.id,
                ),
              );
              await onSaved();
              onClose();
            });
          }}
        >
          <label className="block">
            {t('goals.titleLabel')}
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            {t('tasks.description')}
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block">
            {t('goals.areaLabel')}
            <select className={select} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">{t('goals.noArea')}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t('inbox.assign')}
            <select className={select} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">{t('tasks.noGoal')}</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t('habits.tracking')}
            <select
              className={select}
              value={tracking}
              onChange={(e) => setTracking(e.target.value as HabitTracking)}
            >
              {['boolean', 'count', 'duration'].map((key) => (
                <option key={key} value={key}>
                  {t(`habits.${key}`)}
                </option>
              ))}
            </select>
          </label>
          {tracking !== 'boolean' ? (
            <div className="grid grid-cols-2 gap-3">
              <label>
                {t('goals.targetLabel')}
                <Input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <label>
                {t('goals.unitLabel')}
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            {t('habits.customDays')}
          </label>
          {custom ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <label key={day} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(e) =>
                      setDays(e.target.checked ? [...days, day] : days.filter((d) => d !== day))
                    }
                  />
                  {new Date(2026, 8, 6 + day).toLocaleDateString(i18n.language, {
                    weekday: 'short',
                  })}
                </label>
              ))}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-danger">
              {t('common.error')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || (custom && !days.length)}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
