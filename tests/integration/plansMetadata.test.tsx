import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EntityEditor } from '../../src/plans/EntityEditor';
import { ActionTable } from '../../src/plans/ActionTable';
import type { Action, State } from '../../src/plans/types';
import { api } from '../../src/plans/api';
vi.mock('../../src/plans/api', () => ({ api: vi.fn().mockResolvedValue({}) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const action: Action = {
  id: 'a',
  version: 1,
  code: 'A1',
  description: 'Inspection',
  objective: 'Qualité',
  module_id: 'm',
  pilot_id: 'u',
  planned_start: '2026-01-01',
  planned_end: '2026-12-01',
  actual_start: '',
  actual_end: '',
  status: 'À faire',
  progress: 0,
  cause: '',
  target: null,
  achieved: null,
  unit: '',
  corrective: [],
  location: 'AUTRE (à préciser)',
  location_other: 'Atelier Nord',
  mission_number: 'MIS-001',
  priority_reference: 'PRI-001',
};
const state: State = {
  user: {
    id: 'u',
    name: 'Admin',
    email: 'a@example.test',
    role: 'ADMIN',
    active: true,
    version: 1,
  },
  users: [
    { id: 'u', name: 'Admin', email: 'a@example.test', role: 'ADMIN', active: true, version: 1 },
  ],
  clients: [],
  projects: [
    {
      id: 'p',
      version: 1,
      code: 'P',
      name: 'Projet',
      client_id: 'c',
      manager_id: 'u',
      members: ['u'],
      description: '',
      planned_start: '2026-01-01',
      planned_end: '2026-12-01',
    },
  ],
  modules: [
    {
      id: 'm',
      version: 1,
      code: 'M',
      name: 'Module',
      project_id: 'p',
      description: '',
      parent_module_id: '',
    },
    {
      id: 'child',
      version: 1,
      code: 'C',
      name: 'Enfant',
      project_id: 'p',
      description: '',
      parent_module_id: 'm',
    },
    {
      id: 'root',
      version: 1,
      code: 'R',
      name: 'Racine',
      project_id: 'p',
      description: '',
      parent_module_id: '',
    },
  ],
  actions: [action],
};
describe('Nouveaux champs FMS', () => {
  it('propose les dix emplacements et affiche AUTRE avec saisie obligatoire', async () => {
    render(
      <EntityEditor
        kind="actions"
        value={action}
        state={state}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    const select = screen.getByLabelText('Emplacement');
    expect(within(select).getAllByRole('option')).toHaveLength(11);
    expect(screen.getByLabelText('Précisez l’emplacement')).toBeRequired();
    expect(screen.getByLabelText('Précisez l’emplacement')).toHaveValue('Atelier Nord');
    fireEvent.change(select, { target: { value: 'FMS TUNISIE' } });
    expect(screen.queryByLabelText('Précisez l’emplacement')).toBeNull();
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form')!); });
    expect(api).toHaveBeenCalledWith(
      '/actions/a',
      'PUT',
      expect.objectContaining({
        data: expect.objectContaining({
          location: 'FMS TUNISIE',
          location_other: '',
          mission_number: 'MIS-001',
          priority_reference: 'PRI-001',
        }),
      }),
    );
  });
  it('filtre et recherche les missions, références et emplacements', () => {
    const second = {
      ...action,
      id: 'b',
      code: 'A2',
      description: 'Audit',
      location: 'SBC ALGÉRIE',
      location_other: '',
      mission_number: 'MIS-002',
      priority_reference: 'PRI-002',
    };
    render(<ActionTable state={state} actions={[action, second]} onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText('Emplacement'), { target: { value: 'SBC ALGÉRIE' } });
    expect(screen.queryByText('Inspection')).toBeNull();
    expect(screen.getByText('Audit')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    fireEvent.change(screen.getByLabelText('N° Mission'), { target: { value: '001' } });
    expect(screen.queryByText('Audit')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    fireEvent.change(screen.getByLabelText('Réf. Action Prioritaire'), {
      target: { value: 'PRI-002' },
    });
    expect(screen.queryByText('Inspection')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    fireEvent.change(screen.getByLabelText('Rechercher une action'), {
      target: { value: 'Atelier Nord' },
    });
    expect(screen.queryByText('Audit')).toBeNull();
  });
  it('exclut le module courant et ses descendants, avec option Aucun', () => {
    render(
      <EntityEditor
        kind="modules"
        value={state.modules[0]}
        state={state}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    const select = screen.getByLabelText('Référence Module Principal');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Aucun', 'R — Racine']);
  });
});
