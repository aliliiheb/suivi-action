import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from './api';
import type { State, Kind, Entity, Action } from './types';
import { statuses, roles } from './types';
import locations from '../../server/plans/location-options.json';
type Props = {
  kind: Kind;
  value?: Entity;
  source?: Entity;
  defaults?: Record<string, unknown>;
  state: State;
  onClose: () => void;
  onSaved: (saved?: Entity) => Promise<void>;
};
const names = {
  clients: 'client',
  projects: 'projet',
  modules: 'module',
  actions: 'action',
  users: 'utilisateur',
};
export function EntityEditor({ kind, value, source, defaults, state, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [keepDates, setKeepDates] = useState(true);
  const data = { ...defaults, ...value } as Record<string, unknown>;
  const [location, setLocation] = useState(String(data.location || ''));
  const [selectedProject, setSelectedProject] = useState(
    String(
      data.project_id ||
        state.projects.find((p) => state.user.role === 'ADMIN' || p.manager_id === state.user.id)
          ?.id ||
        '',
    ),
  );
  const [parentId, setParentId] = useState(String(data.parent_module_id || ''));
  const [selectedModule, setSelectedModule] = useState(
    String(data.module_id || state.modules[0]?.id || ''),
  );
  const parentOptions = state.modules.filter((candidate) => {
    if (candidate.project_id !== selectedProject) return false;
    const seen = new Set<string>();
    let current: typeof candidate | undefined = candidate;
    while (current) {
      if (current.id === value?.id || seen.has(current.id)) return false;
      seen.add(current.id);
      current = state.modules.find((m) => m.id === current?.parent_module_id);
    }
    return true;
  });
  const pilot = kind === 'actions' && state.user.role === 'PILOTE';
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const input = (
    name: string,
    label: string,
    type = 'text',
    required = false,
    readOnly = false,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        readOnly={readOnly}
        defaultValue={String(data[name] ?? '')}
        maxLength={
          type === 'password'
            ? 72
            : name === 'location_other'
              ? 200
              : ['mission_number', 'priority_reference'].includes(name)
                ? 120
                : 2000
        }
        min={name === 'progress' ? 0 : undefined}
        max={name === 'progress' ? 100 : undefined}
        step={type === 'number' ? 'any' : undefined}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: { id: string; name: string }[],
    disabled = false,
  ) => (
    <label key={name === 'pilot_id' ? `${name}-${selectedModule}` : name}>
      {label}
      <select
        aria-label={label}
        name={name}
        defaultValue={String(data[name] ?? options[0]?.id ?? '')}
        onChange={
          name === 'project_id'
            ? (e) => {
                setSelectedProject(e.target.value);
                setParentId('');
              }
            : name === 'module_id'
              ? (e) => setSelectedModule(e.target.value)
              : undefined
        }
        disabled={disabled}
        required
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {disabled && <input type="hidden" name={name} value={String(data[name] ?? '')} />}
    </label>
  );
  const textarea = (name: string, label: string, readOnly = false) => (
    <label className="wide" key={name}>
      {label}
      <textarea
        name={name}
        defaultValue={String(data[name] ?? '')}
        readOnly={readOnly}
        rows={3}
        maxLength={10000}
      />
    </label>
  );
  const moduleId = selectedModule;
  const project = state.projects.find(
    (p) => p.id === state.modules.find((m) => m.id === moduleId)?.project_id,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(f.entries());
    delete payload.copy_documents;
    delete payload.copy_actions;
    if (kind === 'projects') payload.members = f.getAll('members');
    if (kind === 'users') {
      payload.active = f.get('active') === 'on';
      if (!payload.password) delete payload.password;
    }
    if (kind === 'actions') {
      payload.location = location;
      payload.location_other = location === 'AUTRE (à préciser)' ? f.get('location_other') : '';
      for (const k of ['progress', 'target', 'achieved'])
        payload[k] =
          payload[k] === '' || payload[k] == null
            ? k === 'progress'
              ? 0
              : null
            : Number(payload[k]);
      payload.corrective = (value as Action)?.corrective || [];
    }
    try {
      const saved = await api<Entity>(
        source ? `/${kind}/${source.id}/duplicate` : `/${kind}${value ? '/' + value.id : ''}`,
        value ? 'PUT' : 'POST',
        {
          data: payload,
          version: source?.version ?? value?.version,
          ...(source
            ? {
                request_id: requestId,
                copy_documents: f.get('copy_documents') === 'on',
                copy_actions: f.get('copy_actions') === 'on',
              }
            : {}),
        },
      );
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <dialog
      ref={ref}
      className="editor"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="entity-editor-title"
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">PLAN D’ACTIONS</span>
            <h2 id="entity-editor-title">
              {source ? 'Dupliquer' : value ? 'Modifier' : 'Créer'}{' '}
              {kind === 'actions' ? 'une' : 'un'} {names[kind]}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {source && (
          <div className="notice">
            <strong>Nouvelle fiche indépendante</strong>
            <p>
              Modifiez l’affectation et les informations avant d’enregistrer. La fiche originale
              reste inchangée. L’historique, les commentaires et le suivi ne sont pas copiés.
            </p>
            {kind === 'projects' && (
              <label className="check">
                <input type="checkbox" name="copy_documents" />
                Copier également les documents joints
              </label>
            )}
            {kind === 'modules' && (
              <label className="check">
                <input type="checkbox" name="copy_actions" />
                Copier également les actions (suivi remis à zéro ; pilote conservé si membre du
                projet, sinon chef de projet)
              </label>
            )}
            {kind === 'actions' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={keepDates}
                  onChange={(e) => setKeepDates(e.target.checked)}
                />
                Conserver les dates prévisionnelles (modifiable ci-dessous)
              </label>
            )}
          </div>
        )}
        {value && (
          <p className="muted">
            Version {value.version}. Une modification simultanée sera signalée avant
            l’enregistrement.
          </p>
        )}
        <div className="form-grid">
          {kind !== 'users' && input('code', 'Code', 'text', true, pilot)}
          {['clients', 'projects', 'modules', 'users'].includes(kind) &&
            input('name', 'Nom / désignation', 'text', true)}
          {kind === 'clients' && textarea('contact', 'Coordonnées (facultatif)')}
          {kind === 'projects' && (
            <>
              {select('client_id', 'Client', state.clients)}
              {select(
                'manager_id',
                'Chef de projet',
                state.users.filter(
                  (u) =>
                    u.active &&
                    u.role !== 'PILOTE' &&
                    (state.user.role === 'ADMIN' || u.id === state.user.id),
                ),
              )}
              {textarea('description', 'Description')}
              {input('planned_start', 'Début prévu', 'date', true)}
              {input('planned_end', 'Fin prévue', 'date', true)}
              <fieldset className="wide">
                <legend>Membres autorisés</legend>
                <div className="checkbox-grid">
                  {state.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <label className="check" key={u.id}>
                        <input
                          type="checkbox"
                          name="members"
                          value={u.id}
                          defaultChecked={((data.members as string[]) || []).includes(u.id)}
                        />
                        {u.name}
                      </label>
                    ))}
                </div>
              </fieldset>
            </>
          )}
          {kind === 'modules' && (
            <>
              {select(
                'project_id',
                'Projet',
                state.projects.filter(
                  (p) => state.user.role === 'ADMIN' || p.manager_id === state.user.id,
                ),
                Boolean(value),
              )}
              {textarea('description', 'Description')}
              <label className="wide">
                Référence Module Principal
                <select
                  name="parent_module_id"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">Aucun</option>
                  {parentOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="form-hint wide">
                Modules du même projet. Le module actuel et ses descendants ne peuvent pas être
                choisis.
              </p>
            </>
          )}
          {kind === 'actions' && (
            <>
              {select(
                'module_id',
                'Module',
                state.modules.filter(
                  (m) =>
                    state.user.role === 'ADMIN' ||
                    state.projects.find((p) => p.id === m.project_id)?.manager_id ===
                      state.user.id ||
                    m.id === moduleId,
                ),
                Boolean(value) || (!source && Boolean(defaults?.module_id)),
              )}
              {textarea('description', 'Description de l’action', pilot)}
              {textarea('objective', 'Objectif attendu', pilot)}
              <label>
                Emplacement
                <select
                  name="location"
                  value={location}
                  disabled={pilot}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">Non renseigné</option>
                  {locations.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {location === 'AUTRE (à préciser)' &&
                input('location_other', 'Précisez l’emplacement', 'text', true, pilot)}
              {input('mission_number', 'N° Mission', 'text', false, pilot)}
              {input('priority_reference', 'Réf. Action Prioritaire', 'text', false, pilot)}
              {select(
                'pilot_id',
                'Pilote responsable',
                state.users.filter(
                  (u) =>
                    u.active &&
                    (!project || project.members.includes(u.id) || project.manager_id === u.id),
                ),
                pilot,
              )}
              {!source &&
                select(
                  'status',
                  'Statut',
                  statuses.map((s) => ({ id: s, name: s })),
                )}
              {!source && input('progress', 'Avancement (%)', 'number', true)}
              {source && (
                <>
                  <input type="hidden" name="status" value="À faire" />
                  <input type="hidden" name="progress" value="0" />
                  <p className="form-hint wide">
                    La copie commence à « À faire », avec 0 % d’avancement.
                  </p>
                </>
              )}
              <div className="form-grid wide" key={`dates-${keepDates}`}>
                {source && !keepDates ? (
                  <>
                    <label>
                      Début prévu
                      <input name="planned_start" type="date" required />
                    </label>
                    <label>
                      Fin prévue
                      <input name="planned_end" type="date" required />
                    </label>
                    <label>
                      2e échéance (facultatif)
                      <input name="deadline_2" type="date" />
                    </label>
                    <label>
                      3e échéance (facultatif)
                      <input name="deadline_3" type="date" />
                    </label>
                  </>
                ) : (
                  <>
                    {input('planned_start', 'Début prévu', 'date', true, pilot)}
                    {input('planned_end', 'Fin prévue', 'date', true, pilot)}
                    {input('deadline_2', '2e échéance (facultatif)', 'date', false, pilot)}
                    {input('deadline_3', '3e échéance (facultatif)', 'date', false, pilot)}
                  </>
                )}
              </div>
              <p className="form-hint wide">
                Les échéances doivent se suivre dans l’ordre. Le retard reste calculé sur la fin
                prévue initiale.
              </p>
              {!source && input('actual_start', 'Début réel', 'date')}
              {!source && input('actual_end', 'Fin réelle', 'date')}
              <p className="form-hint wide">
                Une action terminée exige 100 % et des dates réelles. L’avancement décrit le travail
                effectué, indépendamment du résultat obtenu.
              </p>
              {input('target', 'Valeur cible (facultatif)', 'number', false, pilot)}
              {!source && input('achieved', 'Valeur réalisée', 'number')}
              {input('unit', 'Unité de mesure', 'text', false, pilot)}
              <p className="form-hint">
                Écart = réalisé − cible. Objectif qualitatif : laissez les trois mesures vides.
              </p>
              {!source && textarea('cause', 'Cause du retard ou de non-réalisation')}
            </>
          )}
          {kind === 'users' && (
            <>
              {input('email', 'Adresse électronique', 'email', true)}
              {select(
                'role',
                'Rôle',
                Object.entries(roles).map(([id, name]) => ({ id, name })),
              )}
              {input(
                'password',
                value
                  ? 'Nouveau mot de passe (laisser vide pour conserver)'
                  : 'Mot de passe (12 caractères minimum)',
                'password',
                !value,
              )}
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={data.active !== false} />
                Compte actif
              </label>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Enregistrement…' : source ? 'Enregistrer la copie' : 'Enregistrer'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
