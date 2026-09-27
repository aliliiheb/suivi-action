import { expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineAdd } from '@/features/goals/InlineAdd';
import '@/shared/i18n';

it('captures with Enter and clears only after successful saving', async () => {
  const add = vi.fn().mockResolvedValue(undefined);
  render(<InlineAdd placeholder="Capture" label="Add" onAdd={add} />);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Capture' });
  await user.type(input, '  Learn 20 words  {Enter}');
  expect(add).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledWith('Learn 20 words');
  expect(input).toHaveValue('');
  cleanup();
});

it('retains the captured text and displays an error after a save failure', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <InlineAdd
      placeholder="Capture"
      label="Add"
      onAdd={async () => {
        throw new Error('disk');
      }}
    />,
  );
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Capture' });
  await user.type(input, 'Keep this{Enter}');
  expect(input).toHaveValue('Keep this');
  expect(screen.getByRole('alert')).toBeVisible();
  log.mockRestore();
  cleanup();
});
