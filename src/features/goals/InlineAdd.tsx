import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Input } from '@/shared/ui/components/Input';
import { Button } from '@/shared/ui/components/Button';

/** Minimal inline "type a title + Enter to add" control used for steps/tasks. */
export function InlineAdd({
  placeholder,
  label,
  onAdd,
}: {
  placeholder: string;
  label: string;
  onAdd: (title: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      await onAdd(trimmed);
      setValue('');
    } catch (err) {
      console.error('Quick capture failed', err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 min-w-0 flex-1"
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={busy || !value.trim()}
        aria-label={label}
      >
        <Plus className="h-4 w-4" />
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {t('common.error')}
        </p>
      ) : null}
    </form>
  );
}
