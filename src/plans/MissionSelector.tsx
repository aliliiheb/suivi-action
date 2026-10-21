import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { MissionEditor } from './MissionEditor';
import { manages, missionNumber, missionUrl, type State, type Mission } from './types';
export function MissionLink({
  state,
  entity,
}: {
  state: State;
  entity: { mission_id?: string; mission_number?: string };
}) {
  const mission = state.missions?.find((m) => m.id === entity.mission_id);
  if (!mission)
    return (
      <span className="muted">
        {entity.mission_id
          ? 'Mission associée (accès restreint)'
          : entity.mission_number
            ? `${entity.mission_number} · ancienne référence non rapprochée`
            : 'Aucune mission associée'}
      </span>
    );
  return (
    <span className="mission-link">
      <a href={missionUrl(mission.id)}>{missionNumber(state, entity)}</a>
      <a
        href={missionUrl(mission.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ouvrir la mission ${mission.number} dans une nouvelle page`}
      >
        <ExternalLink size={15} />
      </a>
      {mission.archived && <small>Archivée</small>}
    </span>
  );
}
export function MissionSelector({
  state,
  value,
  onChange,
  clientId,
  projectId,
  legacy,
  disabled = false,
}: {
  state: State;
  value: string;
  onChange: (id: string) => void;
  clientId?: string;
  projectId?: string;
  legacy?: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ value?: Mission } | null>(null);
  const [local, setLocal] = useState<Mission[]>([]);
  const missions = [
    ...(state.missions || []).filter((m) => !local.some((l) => l.id === m.id)),
    ...local,
  ];
  const selected = missions.find((m) => m.id === value);
  const choices = missions.filter(
    (m) =>
      m.id === value ||
      (!m.archived &&
        (!clientId || m.client_id === clientId) &&
        `${m.number} ${m.title}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))),
  );
  const currentState = { ...state, missions };
  return (
    <div className="mission-selector wide">
      <div className="form-grid">
        <label>
          Rechercher une mission
          <input
            type="search"
            placeholder="Numéro ou intitulé"
            value={search}
            disabled={disabled}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          N° Mission
          <select
            aria-label="N° Mission"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Aucune mission associée</option>
            {value && !selected && (
              <option value={value}>Mission associée (accès restreint)</option>
            )}
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.number} — {m.title} · {state.clients.find((c) => c.id === m.client_id)?.name} ·{' '}
                {m.status}
                {m.archived ? ' · Archivée' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {legacy && (
        <p className="form-hint">
          Ancien numéro conservé : {legacy}. Sélectionnez explicitement une mission pour le
          rapprocher.
        </p>
      )}
      <div className="inline">
        {selected && (
          <>
            <a
              className="text-button"
              target="_blank"
              rel="noopener noreferrer"
              href={missionUrl(value)}
            >
              Consulter la fiche <ExternalLink size={15} />
            </a>
            {!disabled && manages(currentState, selected) && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor({ value: selected })}
              >
                Modifier la mission
              </button>
            )}
          </>
        )}
        {!disabled && state.user.role !== 'PILOTE' && (
          <button type="button" className="secondary" onClick={() => setEditor({})}>
            Créer une mission
          </button>
        )}
        {value && !disabled && (
          <button type="button" className="text-button" onClick={() => onChange('')}>
            Retirer l’association
          </button>
        )}
      </div>
      {editor &&
        createPortal(
          <MissionEditor
            state={currentState}
            value={editor.value}
            clientId={clientId}
            projectId={projectId}
            onClose={() => setEditor(null)}
            onSaved={async (m) => {
              setLocal((old) => [...old.filter((v) => v.id !== m.id), m]);
              onChange(m.id);
              setSearch('');
            }}
          />,
          document.body,
        )}
    </div>
  );
}
