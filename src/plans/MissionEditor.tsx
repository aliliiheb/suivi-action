import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from './api';
import { missionStatuses, missionPriorities, manages, type Mission, type State } from './types';
import locations from '../../server/plans/location-options.json';
export function MissionEditor({
  state,
  value,
  source,
  clientId,
  projectId,
  onClose,
  onSaved,
}: {
  state: State;
  value?: Mission;
  source?: Mission;
  clientId?: string;
  projectId?: string;
  onClose: () => void;
  onSaved: (mission: Mission) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [data] = useState(() => ({
    ...source,
    ...value,
    ...(!value
      ? {
          number: `MIS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'Planifiée',
          actual_start: '',
          actual_end: '',
          observations: '',
          archived: false,
        }
      : {}),
    client_id: value?.client_id || clientId || source?.client_id || state.clients[0]?.id || '',
    project_id: value?.project_id || projectId || source?.project_id || '',
    manager_id: value?.manager_id || source?.manager_id || state.user.id,
  }));
  const [client, setClient] = useState(data.client_id);
  const [project, setProject] = useState(data.project_id);
  const [location, setLocation] = useState(data.location || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  const field = (name: keyof Mission, label: string, type = 'text', required = false) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={String(data[name as keyof typeof data] ?? '')}
        required={required}
        maxLength={name === 'number' ? 120 : 2000}
      />
    </label>
  );
  const text = (name: 'description' | 'observations', label: string) => (
    <label className="wide">
      {label}
      <textarea name={name} defaultValue={data[name] || ''} maxLength={10000} rows={3} />
    </label>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(f),
      members: f.getAll('members'),
      client_id: client,
      project_id: project,
      location,
      location_other: location === 'AUTRE (à préciser)' ? f.get('location_other') : '',
      archived: data.archived || false,
    };
    try {
      const saved = await api<Mission>(
        source ? `/missions/${source.id}/duplicate` : value ? `/missions/${value.id}` : '/missions',
        value ? 'PUT' : 'POST',
        {
          data: payload,
          version: (source || value)?.version,
          ...(source ? { request_id: requestId } : {}),
        },
      );
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor"
      onCancel={(e) => {
        e.stopPropagation();
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="mission-editor-title"
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">GESTION DES MISSIONS</span>
            <h2 id="mission-editor-title">
              {source
                ? 'Dupliquer la mission'
                : value
                  ? 'Modifier la mission'
                  : 'Créer une mission'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer la mission"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {source && (
          <p className="notice">
            Nouvelle mission indépendante : nouveau numéro, suivi remis à zéro. Documents,
            associations et historique ne sont pas copiés.
          </p>
        )}
        <div className="form-grid">
          {field('number', 'N° Mission', 'text', true)}
          {field('title', 'Intitulé de la mission', 'text', true)}
          <label>
            Société / Client
            <select
              aria-label="Société / Client"
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setProject('');
              }}
              required
            >
              <option value="">Choisir une société</option>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projet associé
            <select
              aria-label="Projet associé"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Aucun</option>
              {state.projects
                .filter((p) => p.client_id === client && (manages(state, p) || p.id === project))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Emplacement
            <select
              aria-label="Emplacement"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Non renseigné</option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          {location === 'AUTRE (à préciser)' &&
            field('location_other', 'Précisez l’emplacement', 'text', true)}
          <label>
            Responsable de mission
            <select
              aria-label="Responsable de mission"
              name="manager_id"
              defaultValue={data.manager_id}
              required
            >
              {state.users
                .filter(
                  (u) =>
                    u.active &&
                    u.role !== 'PILOTE' &&
                    (state.user.role === 'ADMIN' || u.id === state.user.id),
                )
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          {text('description', 'Description détaillée')}
          <fieldset className="wide">
            <legend>Membres de l’équipe</legend>
            <div className="checkbox-grid">
              {state.users
                .filter((u) => u.active)
                .map((u) => (
                  <label className="check" key={u.id}>
                    <input
                      name="members"
                      type="checkbox"
                      value={u.id}
                      defaultChecked={(data.members || [state.user.id]).includes(u.id)}
                    />
                    {u.name}
                  </label>
                ))}
            </div>
          </fieldset>
          {field('planned_start', 'Date de début prévue', 'date', true)}
          {field('planned_end', 'Date de fin prévue', 'date', true)}
          {field('actual_start', 'Début réel', 'date')}
          {field('actual_end', 'Fin réelle', 'date')}
          <label>
            Statut
            <select aria-label="Statut" name="status" defaultValue={data.status || 'Planifiée'}>
              {missionStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Priorité
            <select aria-label="Priorité" name="priority" defaultValue={data.priority || 'Normale'}>
              {missionPriorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {text('observations', 'Observations')}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Enregistrement…' : source ? 'Enregistrer la copie' : 'Enregistrer la mission'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
