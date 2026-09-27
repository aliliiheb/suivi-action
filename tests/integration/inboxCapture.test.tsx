import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InboxPage } from '@/features/execution/InboxPage';
import { createSqlJsDatabase, type SqlJsHandle } from '@/db/drivers/sqljs';
import { GoalRepository } from '@/db/repositories/goals';
import { TaskRepository } from '@/db/repositories/tasks';
import { ProgressService } from '@/db/services/progressService';
import { atomicAsync } from '@/db/transaction';
import type { DbContextValue } from '@/app/providers/databaseContext';
import { addDaysMs, dayKey, endOfDayMs, startOfDayMs } from '@/shared/lib/time';
import i18n from '@/shared/i18n';

let handle: SqlJsHandle;
let context: Pick<DbContextValue, 'commit' | 'progress'> & {
  repos: { tasks: TaskRepository; goals: GoalRepository };
};
vi.mock('@/app/providers/databaseContext', () => ({ useDb: () => context }));

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  handle = await createSqlJsDatabase();
  context = {
    repos: { tasks: new TaskRepository(handle.db), goals: new GoalRepository(handle.db) },
    progress: new ProgressService(handle.db),
    commit: (fn) => atomicAsync(handle.db, fn),
  };
});
afterEach(() => {
  cleanup();
  handle.raw.close();
  vi.restoreAllMocks();
});

async function showInbox() {
  render(
    <MemoryRouter>
      <InboxPage />
    </MemoryRouter>,
  );
  const title = screen.getByRole('textbox', { name: i18n.t('inbox.placeholder') });
  await waitFor(() => expect(title).toBeEnabled());
  return { title, user: userEvent.setup(), date: screen.getByLabelText('Date prévue') };
}

it('creates a dated task linked to a goal before submission and preserves its local day on reopening', async () => {
  const goalId = await context.repos.goals.create({ title: 'Étudier' });
  const { title, user, date } = await showInbox();
  await user.selectOptions(screen.getByLabelText('Rattacher à un objectif'), goalId);
  fireEvent.change(date, { target: { value: '2031-04-23' } });
  await user.type(title, 'Réviser le chapitre{Enter}');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('23/04/2031'));
  const plannedDate = new Date('2031-04-23T00:00:00').getTime();
  const rows = await context.repos.tasks.listCalendar(plannedDate, endOfDayMs(plannedDate));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title: 'Réviser le chapitre',
    goalId,
    plannedDate,
    status: 'planned',
  });
  expect(await context.repos.tasks.listInbox()).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'Voir le calendrier' })).toHaveAttribute(
    'href',
    '/calendar',
  );
  expect(title).toHaveValue('');
  expect(date).toHaveValue('');
  const reopened = await createSqlJsDatabase(handle.export());
  const stored = await new TaskRepository(reopened.db).getById(rows[0]!.id);
  expect(dayKey(stored!.plannedDate!)).toBe('2031-04-23');
  reopened.raw.close();
});

it('supports today, tomorrow and clearing the date, and schedules without a goal', async () => {
  const { title, user, date } = await showInbox();
  await user.click(screen.getByRole('button', { name: 'Demain' }));
  expect(date).toHaveValue(dayKey(addDaysMs(1)));
  await user.click(screen.getByRole('button', { name: 'Sans date' }));
  expect(date).toHaveValue('');
  await user.click(screen.getByRole('button', { name: "Aujourd'hui" }));
  await user.type(title, 'Marcher');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Marcher'));
  const tasks = await context.repos.tasks.listPlannedActiveBetween(startOfDayMs(), endOfDayMs());
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ goalId: null, plannedDate: startOfDayMs(), status: 'planned' });
});

it('keeps an undated capture in Inbox', async () => {
  const { title, user } = await showInbox();
  await user.type(title, 'Une idée{Enter}');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Une idée'));
  expect(await context.repos.tasks.listInbox()).toEqual([
    expect.objectContaining({
      title: 'Une idée',
      plannedDate: null,
      goalId: null,
      status: 'inbox',
    }),
  ]);
});

it('retains the title, date and goal after a failed save and retries without losing them', async () => {
  const goalId = await context.repos.goals.create({ title: 'Lire' });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(context, 'commit').mockRejectedValueOnce(new Error('Save unavailable'));
  const { title, user, date } = await showInbox();
  await user.selectOptions(screen.getByLabelText('Rattacher à un objectif'), goalId);
  fireEvent.change(date, { target: { value: '2031-04-23' } });
  await user.type(title, 'Garder cette tâche{Enter}');
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(title).toHaveValue('Garder cette tâche');
  expect(date).toHaveValue('2031-04-23');
  expect(screen.getByLabelText('Rattacher à un objectif')).toHaveValue(goalId);
  expect(await context.repos.tasks.listActive()).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Garder cette tâche'));
  expect(await context.repos.tasks.listActive()).toHaveLength(1);
});
