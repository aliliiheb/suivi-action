import { Check, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveStatus } from '@/app/stores/saveStatus';
import { cn } from '@/shared/lib/cn';

/** Shows Saving… / Saved / Error in the header (spec §57). */
export function SaveStatusIndicator() {
  const status = useSaveStatus((s) => s.status);
  const { t } = useTranslation();
  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('common.saving')}
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success">
        <Check className="h-3.5 w-3.5" />
        {t('common.saved')}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-danger')}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {t('common.error')}
    </span>
  );
}
