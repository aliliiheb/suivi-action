import { type ReactNode } from 'react';
import * as Label from '@radix-ui/react-label';

/** Labeled form field with inline error text shown near the control (§60). */
export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="ui-field space-y-1.5">
      <Label.Root htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </Label.Root>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
