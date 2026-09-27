import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { Field } from '@/shared/ui/components/Field';
import { cn } from '@/shared/lib/cn';
import type { LifeArea } from '@/db/repositories/lifeAreas';

export const AREA_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const;

export interface AreaFormValues {
  name: string;
  color: string | null;
}

export function AreaFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LifeArea | null;
  onSubmit: (values: AreaFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(AREA_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the dialog opens (create vs. edit).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? AREA_COLORS[0]);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('common.required'));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, color });
      onOpenChange(false);
    } catch {
      setError(t('common.error'));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial ? t('common.edit') : t('areas.new')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <Field label={t('areas.nameLabel')} htmlFor="area-name" error={error}>
            <Input
              id="area-name"
              value={name}
              autoFocus
              placeholder={t('areas.namePlaceholder')}
              aria-invalid={!!error}
              aria-describedby={error ? 'area-name-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
            />
          </Field>

          <Field label={t('areas.colorLabel')} htmlFor="area-color">
            <div id="area-color" className="flex flex-wrap gap-2">
              {AREA_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition',
                    color === c ? 'ring-2 ring-ring' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {initial ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
