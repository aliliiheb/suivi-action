import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from './api';
import { MissionEditor } from './MissionEditor';
import { MissionLink } from './MissionSelector';
import { missionUrl } from './types';
import { ProjectDocuments } from './ProjectDocuments';
import { CopyProvenance } from './CopyProvenance';
import {
  dateFR,
  manages,
  missionStatuses,
  missionPriorities,
  type Mission,
  type State,
  type Kind,
  type Audit,
} from './types';
const late = (m: Mission) =>
  !m.archived &&
  !['Terminée', 'Annulée'].includes(m.status) &&
  m.planned_end < new Date().toISOString().slice(0, 10);
export function Missions({
  state,
  onRefresh,
  onOpen,
}: {
  state: State;
  onRefresh: () => Promise<void>;
  onOpen: (kind: Kind, id: string) => void;
}) {
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.search).get('mission') || '',
  );
  const [editor, setEditor] = useState<{ value?: Mission; source?: Mission } | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [archives, setArchives] = useState(false);
  const [sort, setSort] = useState('number');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const missions = state.missions || [];
  const filtered = missions
    .filter(
      (m) =>
        (archives || !m.archived) &&
        `${m.number} ${m.title} ${m.description}`
          .toLocaleLowerCase('fr')
          .includes(search.toLocaleLowerCase('fr')) &&
        ['client_id', 'manager_id', 'status', 'priority'].every(
          (k) => !filters[k] || m[k as keyof Mission] === filters[k],
        ) &&
        (!filters.start || m.planned_end >= filters.start) &&
        (!filters.end || m.planned_start <= filters.end),
    )
    .sort((a, b) =>
      String(a[sort as keyof Mission]).localeCompare(String(b[sort as keyof Mission]), 'fr', {
        numeric: true,
      }),
    );
  const mission = missions.find((m) => m.id === selected);
  const select = (id: string) => {
    setSelected(id);
    window.history.replaceState(null, '', id ? missionUrl(id) : '/plans');
  };
  const filter = (key: string, label: string, options: { id: string; name: string }[]) => (
    <label>
      {label}
      <select
        value={filters[key] || ''}
        onChange={(e) => {
          setFilters({ ...filters, [key]: e.target.value });
          setPage(0);
        }}
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const index = filtered.findIndex((m) => m.id === selected);
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 15) - 1));
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">PILOTAGE DES MISSIONS</span>
          <h1>{mission ? mission.number : 'Missions'}</h1>
          <p>
            {mission ? mission.title : 'Un référentiel commun pour vos équipes et vos projets.'}
          </p>
        </div>
        {state.user.role !== 'PILOTE' && (
          <button
            className="primary"
            onClick={() => setEditor({})}
            disabled={!state.clients.length}
          >
            <Plus size={17} />
            Créer une mission
          </button>
        )}
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel mission-filters" aria-label="Filtres des missions">
        <div className="filter-grid">
          <label>
            Rechercher une mission
            <input
              type="search"
              placeholder="Numéro ou intitulé"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {filter('client_id', 'Société', state.clients)}
          {filter('manager_id', 'Responsable', state.users)}
          {filter(
            'status',
            'Statut',
            missionStatuses.map((s) => ({ id: s, name: s })),
          )}
          {filter(
            'priority',
            'Priorité',
            missionPriorities.map((s) => ({ id: s, name: s })),
          )}
          <label>
            Période du
            <input
              type="date"
              value={filters.start || ''}
              onChange={(e) => {
                setFilters({ ...filters, start: e.target.value });
                setPage(0);
              }}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              value={filters.end || ''}
              onChange={(e) => {
                setFilters({ ...filters, end: e.target.value });
                setPage(0);
              }}
            />
          </label>
          <label>
            Trier par
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="number">N° Mission</option>
              <option value="title">Intitulé</option>
              <option value="planned_end">Fin prévue</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={archives}
            onChange={(e) => {
              setArchives(e.target.checked);
              setPage(0);
            }}
          />
          Inclure les missions archivées
        </label>
      </section>
      {selected ? (
        <>
          <div className="mission-navigation">
            <button className="back" onClick={() => select('')}>
              <ArrowLeft size={16} />
              Liste des missions
            </button>
            <label>
              Mission
              <select value={selected} onChange={(e) => select(e.target.value)}>
                {!filtered.some((m) => m.id === selected) && (
                  <option value={selected}>
                    {mission?.number || 'Mission inaccessible'} (hors filtres)
                  </option>
                )}
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.number} — {m.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={index <= 0}
              onClick={() => select(filtered[index - 1]!.id)}
            >
              Précédente
            </button>
            <button
              className="secondary"
              disabled={index < 0 || index >= filtered.length - 1}
              onClick={() => select(filtered[index + 1]!.id)}
            >
              Suivante
            </button>
          </div>
          {mission ? (
            <MissionDetail
              key={mission.id}
              mission={mission}
              state={state}
              onRefresh={onRefresh}
              onOpen={onOpen}
              onEdit={() => setEditor({ value: mission })}
              onCopy={() => setEditor({ source: mission })}
              onSource={select}
            />
          ) : (
            <p className="error" role="alert">
              Cette mission est introuvable ou vous n’avez pas les droits nécessaires.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="stats mission-stats">
            {[
              { label: 'Total', value: filtered.length },
              ...missionStatuses.map((s) => ({
                label: s,
                value: filtered.filter((m) => m.status === s).length,
              })),
              { label: 'En retard', value: filtered.filter(late).length },
            ].map((s) => (
              <article className="stat" key={s.label}>
                <span>{s.label}</span>
                <strong>{s.value}</strong>
              </article>
            ))}
          </div>
          <div className="dashboard-grid">
            {(['client_id', 'manager_id'] as const).map((key) => (
              <section className="panel" key={key}>
                <h2>Répartition par {key === 'client_id' ? 'société' : 'responsable'}</h2>
                <ul className="mission-distribution">
                  {[...new Set(filtered.map((m) => m[key]))].map((id) => (
                    <li key={id}>
                      <span>
                        {(key === 'client_id' ? state.clients : state.users).find(
                          (r) => r.id === id,
                        )?.name || 'Non disponible'}
                      </span>
                      <strong>{filtered.filter((m) => m[key] === id).length}</strong>
                    </li>
                  ))}
                </ul>
                {!filtered.length && <p className="muted">Aucune mission pour ces filtres.</p>}
              </section>
            ))}
          </div>
          <section className="panel">
            <details className="legacy-missions">
              <summary>
                Anciennes références à rapprocher (
                {state.actions.filter((a) => a.mission_number && !a.mission_id).length})
              </summary>
              <p className="muted">
                Les numéros historiques restent inchangés. Ouvrez une action et sélectionnez
                explicitement sa mission.
              </p>
              <ul className="mission-related">
                {state.actions
                  .filter((a) => a.mission_number && !a.mission_id)
                  .map((a) => (
                    <li key={a.id}>
                      <span>{a.mission_number}</span>
                      <button className="text-button" onClick={() => onOpen('actions', a.id)}>
                        {a.code} — {a.description}
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
            <div className="table-scroll">
              <table className="mission-table">
                <caption className="mission-caption">
                  Liste des missions — {filtered.length} résultat(s)
                </caption>
                <thead>
                  <tr>
                    {[
                      'N° Mission',
                      'Intitulé',
                      'Société',
                      'Responsable',
                      'Période prévue',
                      'Statut',
                      'Priorité',
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(safePage * 15, safePage * 15 + 15).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <a
                          href={missionUrl(m.id)}
                          onClick={(e) => {
                            e.preventDefault();
                            select(m.id);
                          }}
                        >
                          {m.number}
                        </a>
                      </td>
                      <td>
                        {m.title}
                        {m.archived && <small>Archivée</small>}
                      </td>
                      <td>{state.clients.find((c) => c.id === m.client_id)?.name}</td>
                      <td>{state.users.find((u) => u.id === m.manager_id)?.name}</td>
                      <td>
                        {dateFR(m.planned_start)} → {dateFR(m.planned_end)}
                      </td>
                      <td>
                        {m.status}
                        {late(m) && <small className="late">En retard</small>}
                      </td>
                      <td>{m.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <p className="empty">
                Aucune mission à afficher. Ajustez les filtres ou créez une mission.
              </p>
            )}
            <footer className="pagination">
              <span>{filtered.length} mission(s)</span>
              <div>
                <button
                  className="secondary"
                  disabled={!safePage}
                  onClick={() => setPage(safePage - 1)}
                >
                  Précédent
                </button>
                <button
                  className="secondary"
                  disabled={(safePage + 1) * 15 >= filtered.length}
                  onClick={() => setPage(safePage + 1)}
                >
                  Suivant
                </button>
              </div>
            </footer>
          </section>
        </>
      )}
      {editor && (
        <MissionEditor
          state={state}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={async (m) => {
            await onRefresh();
            select(m.id);
            setNotice(
              editor.source
                ? 'La copie indépendante a été créée.'
                : 'La mission a été enregistrée.',
            );
          }}
        />
      )}
    </>
  );
}
function MissionDetail({
  mission: m,
  state,
  onRefresh,
  onOpen,
  onEdit,
  onCopy,
  onSource,
}: {
  mission: Mission;
  state: State;
  onRefresh: () => Promise<void>;
  onOpen: (kind: Kind, id: string) => void;
  onEdit: () => void;
  onCopy: () => void;
  onSource: (id: string) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Audit[]>([]);
  const [kind, setKind] = useState<'projects' | 'modules' | 'actions'>('projects');
  const [entityId, setEntityId] = useState('');
  const editable = manages(state, m);
  useEffect(() => {
    let active = true;
    void api<Audit[]>(`/missions/${m.id}/history`)
      .then((h) => {
        if (active) setHistory(h);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [m.id, state]);
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await onRefresh();
      setHistory(await api<Audit[]>(`/missions/${m.id}/history`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const projectFor = (k: Kind, entity: { id: string; project_id?: string; module_id?: string }) =>
    k === 'projects'
      ? state.projects.find((p) => p.id === entity.id)
      : k === 'modules'
        ? state.projects.find((p) => p.id === entity.project_id)
        : state.projects.find(
            (p) => p.id === state.modules.find((mod) => mod.id === entity.module_id)?.project_id,
          );
  const related = {
    projects: state.projects.filter((p) => p.mission_id === m.id || p.id === m.project_id),
    modules: state.modules.filter((p) => p.mission_id === m.id),
    actions: state.actions.filter((p) => p.mission_id === m.id),
  };
  const candidates = state[kind].filter(
    (e) =>
      projectFor(kind, e)?.client_id === m.client_id &&
      manages(state, projectFor(kind, e)) &&
      e.mission_id !== m.id,
  );
  const label = (entity: { code: string; name?: string; description?: string }) =>
    `${entity.code} — ${entity.name || entity.description}`;
  async function link(k: typeof kind, id: string, version: number, detach = false) {
    await run(() =>
      api(`/missions/${m.id}/links`, 'POST', { kind: k, entity_id: id, version, detach }),
    );
    setEntityId('');
  }
  async function comment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const content = new FormData(form).get('content');
    await run(async () => {
      await api(`/missions/${m.id}/comments`, 'POST', { content });
      form.reset();
    });
  }
  return (
    <>
      <div className="inline mission-controls">
        <span className="badge">{m.status}</span>
        <span>{m.priority}</span>
        {m.archived && <span className="badge">Archivée</span>}
        {late(m) && <span className="badge danger">En retard</span>}
        {editable && (
          <>
            <button className="primary" onClick={onEdit}>
              Modifier la mission
            </button>
            <button className="secondary" onClick={onCopy}>
              Dupliquer la mission
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => {
                  const { id, version, ...data } = m;
                  return api(`/missions/${id}`, 'PUT', {
                    version,
                    data: { ...data, archived: !m.archived },
                  });
                })
              }
            >
              {m.archived ? 'Réactiver la mission' : 'Archiver la mission'}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <CopyProvenance kind="missions" id={m.id} onSource={(_kind, id) => onSource(id)} />
      <section className="panel mission-description">
        <h2>Informations générales</h2>
        <dl className="mission-facts">
          <div>
            <dt>N° Mission</dt>
            <dd>
              <MissionLink state={state} entity={{ mission_id: m.id }} />
            </dd>
          </div>
          <div>
            <dt>Société / Client</dt>
            <dd>{state.clients.find((c) => c.id === m.client_id)?.name}</dd>
          </div>
          <div>
            <dt>Emplacement</dt>
            <dd>
              {m.location === 'AUTRE (à préciser)'
                ? m.location_other
                : m.location || 'Non renseigné'}
            </dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{state.users.find((u) => u.id === m.manager_id)?.name}</dd>
          </div>
          <div>
            <dt>Équipe</dt>
            <dd>
              {m.members
                .map((id) => state.users.find((u) => u.id === id)?.name || 'Membre indisponible')
                .join(', ')}
            </dd>
          </div>
          <div>
            <dt>Période prévue</dt>
            <dd>
              {dateFR(m.planned_start)} → {dateFR(m.planned_end)}
            </dd>
          </div>
          <div>
            <dt>Réalisation effective</dt>
            <dd>
              {dateFR(m.actual_start)} → {dateFR(m.actual_end)}
            </dd>
          </div>
        </dl>
        <h3>Description détaillée</h3>
        <p className="preserve-lines">{m.description || 'Aucune description.'}</p>
        <h3>Observations</h3>
        <p className="preserve-lines">{m.observations || 'Aucune observation.'}</p>
      </section>
      <section className="panel">
        <h2>Éléments associés</h2>
        <p className="muted">
          Les associations ne changent pas les informations métier ni l’avancement des éléments.
        </p>
        {editable && !m.archived && (
          <form
            className="mission-associate"
            onSubmit={(e) => {
              e.preventDefault();
              const entity = state[kind].find((r) => r.id === entityId);
              if (entity) void link(kind, entity.id, entity.version);
            }}
          >
            <label>
              Type d’élément
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setEntityId('');
                }}
              >
                <option value="projects">Projet</option>
                <option value="modules">Module</option>
                <option value="actions">Action</option>
              </select>
            </label>
            <label>
              Élément à associer
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
                <option value="">Sélectionner</option>
                {candidates.map((e) => (
                  <option value={e.id} key={e.id}>
                    {label(e)}
                    {e.mission_id ? ' (déjà associé : sera réaffecté)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy || !entityId}>
              Associer / réaffecter
            </button>
          </form>
        )}
        {(['projects', 'modules', 'actions'] as const).map((k) => (
          <div key={k}>
            <h3>
              {{ projects: 'Projets liés', modules: 'Modules liés', actions: 'Actions liées' }[k]}
            </h3>
            <ul className="mission-related">
              {related[k].map((e) => (
                <li key={e.id}>
                  <button className="text-button" onClick={() => onOpen(k, e.id)}>
                    {label(e)}
                  </button>
                  {k === 'projects' && e.id === m.project_id && (
                    <small>Projet principal (modifiable dans la fiche Mission)</small>
                  )}
                  {editable && e.mission_id === m.id && manages(state, projectFor(k, e)) && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void link(k, e.id, e.version, true)}
                    >
                      Dissocier
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!related[k].length && <p className="muted">Aucun élément accessible lié.</p>}
          </div>
        ))}
      </section>
      <ProjectDocuments
        key={m.id}
        projectId={m.id}
        ownerKind="missions"
        canManage={editable && !m.archived}
      />
      <section className="panel">
        <h2>Commentaires</h2>
        {!m.archived && (
          <form onSubmit={comment}>
            <label>
              Ajouter un commentaire
              <textarea name="content" required maxLength={4000} rows={3} />
            </label>
            <button className="primary" disabled={busy}>
              Publier le commentaire
            </button>
          </form>
        )}
        {history
          .filter((h) => h.operation === 'Commentaire')
          .map((h) => (
            <article className="mission-comment" key={h.id}>
              <small>
                {h.author} · {new Date(h.at).toLocaleString('fr-FR')}
              </small>
              <p className="preserve-lines">{String(h.after_data?.content || '')}</p>
            </article>
          ))}
      </section>
      <section className="panel">
        <h2>Historique de la mission</h2>
        {history
          .filter((h) => h.operation !== 'Commentaire')
          .map((h) => (
            <details className="mission-history" key={h.id}>
              <summary>
                {h.operation} · {h.author} · {new Date(h.at).toLocaleString('fr-FR')}
              </summary>
              <MissionChanges entry={h} state={state} />
            </details>
          ))}
      </section>
    </>
  );
}
function MissionChanges({ entry, state }: { entry: Audit; state: State }) {
  const labels: Record<string, string> = {
    number: 'N° Mission',
    title: 'Intitulé',
    description: 'Description',
    client_id: 'Société',
    project_id: 'Projet principal',
    manager_id: 'Responsable',
    members: 'Équipe',
    location: 'Emplacement',
    location_other: 'Emplacement personnalisé',
    planned_start: 'Début prévu',
    planned_end: 'Fin prévue',
    actual_start: 'Début réel',
    actual_end: 'Fin réelle',
    status: 'Statut',
    priority: 'Priorité',
    observations: 'Observations',
    archived: 'Archivage',
    kind: 'Type',
    entity_id: 'Élément',
    mission_id: 'Mission',
    source_id: 'Source',
    target_id: 'Copie',
    document_id: 'Document',
    filename: 'Nom du fichier',
    size: 'Taille',
    version: 'Version',
    id: 'Identifiant',
  };
  const display = (v: unknown): string =>
    Array.isArray(v)
      ? v.map(display).join(', ')
      : typeof v === 'boolean'
        ? v
          ? 'Oui'
          : 'Non'
        : v == null || v === ''
          ? '—'
          : typeof v === 'object'
            ? JSON.stringify(v)
            : state.users.find((u) => u.id === v)?.name ||
              state.clients.find((c) => c.id === v)?.name ||
              state.projects.find((p) => p.id === v)?.name ||
              state.missions?.find((m) => m.id === v)?.number ||
              String(v);
  return (
    <dl className="mission-changes">
      {[
        ...new Set([
          ...Object.keys(entry.before_data || {}),
          ...Object.keys(entry.after_data || {}),
        ]),
      ]
        .filter(
          (key) =>
            JSON.stringify(entry.before_data?.[key]) !== JSON.stringify(entry.after_data?.[key]),
        )
        .map((key) => (
          <div key={key}>
            <dt>{labels[key] || key}</dt>
            <dd>
              <span>{display(entry.before_data?.[key])}</span> →{' '}
              <strong>{display(entry.after_data?.[key])}</strong>
            </dd>
          </div>
        ))}
    </dl>
  );
}
