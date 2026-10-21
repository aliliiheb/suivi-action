import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EntityEditor } from '../../src/plans/EntityEditor';
import { ActionTable } from '../../src/plans/ActionTable';
import type { Action, State, Mission } from '../../src/plans/types';
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
  it('propose les onze emplacements dont FSP et affiche AUTRE avec saisie obligatoire', async () => {
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
    expect(within(select).getAllByRole('option')).toHaveLength(12);
    expect(within(select).getByRole('option', { name: 'FSP ALGERIE' })).toBeInTheDocument();
    expect(screen.getByLabelText('Précisez l’emplacement')).toBeRequired();
    expect(screen.getByLabelText('Précisez l’emplacement')).toHaveValue('Atelier Nord');
    fireEvent.change(select, { target: { value: 'FMS TUNISIE' } });
    expect(screen.queryByLabelText('Précisez l’emplacement')).toBeNull();
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form')!);
    });
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
  it('duplique une action dans un autre module et bloque le double envoi', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(
      <EntityEditor
        kind="actions"
        source={action}
        defaults={{ ...action, code: 'COPIE' }}
        state={state}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    expect(screen.getByText('Nouvelle fiche indépendante')).toBeVisible();
    expect(screen.getByLabelText('Module')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'root' } });
    fireEvent.click(
      screen.getByLabelText('Conserver les dates prévisionnelles (modifiable ci-dessous)'),
    );
    expect(screen.getByLabelText('Début prévu')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Début prévu'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Fin prévue'), { target: { value: '2027-02-01' } });
    const form = screen.getByRole('button', { name: 'Enregistrer la copie' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(
      '/actions/a/duplicate',
      'POST',
      expect.objectContaining({
        request_id: expect.any(String),
        data: expect.objectContaining({
          module_id: 'root',
          status: 'À faire',
          progress: 0,
          planned_start: '2027-01-01',
          achieved: null,
        }),
      }),
    );
    await act(async () => resolve({ id: 'copy' }));
  });
  it('réinitialise le module principal quand le projet de destination change', () => {
    const next = {
      ...state,
      projects: [...state.projects, { ...state.projects[0]!, id: 'p2', name: 'Autre projet' }],
    };
    render(
      <EntityEditor
        kind="modules"
        source={state.modules[1]}
        defaults={{ ...state.modules[1], code: 'COPIE' }}
        state={next}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    expect(screen.getByLabelText('Projet')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Projet'), { target: { value: 'p2' } });
    expect(screen.getByLabelText('Référence Module Principal')).toHaveValue('');
    expect(
      within(screen.getByLabelText('Référence Module Principal')).getAllByRole('option'),
    ).toHaveLength(1);
    expect(screen.getByLabelText(/Copier également les actions/)).not.toBeChecked();
  });
  it('sélectionne une mission recherchée et conserve le numéro historique', async () => {
    const mission: Mission = {
      id: 'mission-1',
      version: 1,
      number: 'MIS-LIVE',
      title: 'Audit',
      description: '',
      client_id: 'c',
      project_id: 'p',
      manager_id: 'u',
      members: ['u'],
      location: 'FSP ALGERIE',
      location_other: '',
      planned_start: '2026-01-01',
      planned_end: '2026-12-01',
      actual_start: '',
      actual_end: '',
      status: 'Planifiée',
      priority: 'Normale',
      observations: '',
      archived: false,
    };
    render(
      <EntityEditor
        kind="actions"
        value={action}
        state={{ ...state, missions: [mission] }}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Rechercher une mission'), {
      target: { value: 'Audit' },
    });
    expect(screen.getByRole('option', { name: /MIS-LIVE — Audit/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('N° Mission'), { target: { value: mission.id } });
    expect(screen.getByRole('link', { name: /Consulter la fiche/ })).toHaveAttribute(
      'href',
      '/plans?mission=mission-1',
    );
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form')!);
    });
    expect(api).toHaveBeenCalledWith(
      '/actions/a',
      'PUT',
      expect.objectContaining({
        data: expect.objectContaining({ mission_id: mission.id, mission_number: 'MIS-001' }),
      }),
    );
  });
  it('crée une mission depuis une action sans enregistrer ni perdre le formulaire parent', async () => {
    const next = {
      ...state,
      clients: [{ id: 'c', version: 1, code: 'C', name: 'FMS', contact: '' }],
    };
    render(
      <EntityEditor
        kind="actions"
        value={action}
        state={next}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Description de l’action'), {
      target: { value: 'Brouillon conservé' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer une mission' }));
    const nested = screen.getByRole('dialog', { name: 'Créer une mission' });
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.change(within(nested).getByLabelText('Intitulé de la mission'), {
      target: { value: 'Mission créée' },
    });
    fireEvent.change(within(nested).getByLabelText('Date de début prévue'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(within(nested).getByLabelText('Date de fin prévue'), {
      target: { value: '2026-12-31' },
    });
    vi.mocked(api).mockResolvedValueOnce({
      id: 'new-mission',
      number: 'MIS-NEW',
      title: 'Mission créée',
      client_id: 'c',
      status: 'Planifiée',
      members: ['u'],
      manager_id: 'u',
      version: 1,
    });
    await act(async () => {
      fireEvent.submit(
        within(nested).getByRole('button', { name: 'Enregistrer la mission' }).closest('form')!,
      );
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/missions', 'POST', expect.anything());
    expect(screen.getByLabelText('Description de l’action')).toHaveValue('Brouillon conservé');
    expect(screen.getByLabelText('N° Mission')).toHaveValue('new-mission');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’association' }));
    expect(screen.getByLabelText('N° Mission')).toHaveValue('');
  });
});
