import { useState } from 'react';
import { ArrowUpDown, ArrowRight, Search } from 'lucide-react';
import type { Action, State } from './types';
import { statuses, dateFR, isLate, projectOf } from './types';
export function Badge({ action }: { action: Action }) {
  return <span className={`badge status-${statuses.indexOf(action.status)}`}>{action.status}</span>;
}
export function ActionTable({
  state,
  actions,
  onOpen,
  compact = false,
}: {
  state: State;
  actions: Action[];
  onOpen: (a: Action) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('planned_end');
  const [asc, setAsc] = useState(true);
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
  const filtered = actions
    .filter((a) => {
      const project = projectOf(state, a);
      const values = {
        client: project?.client_id,
        project: project?.id,
        module: a.module_id,
        pilot: a.pilot_id,
        status: a.status,
      };
      return (
        `${a.code} ${a.description} ${a.objective}`
          .toLocaleLowerCase('fr')
          .includes(search.toLocaleLowerCase('fr')) &&
        Object.entries(values).every(([k, v]) => !filters[k] || filters[k] === v) &&
        (!filters.start || a.planned_end >= filters.start) &&
        (!filters.end || a.planned_end <= filters.end)
      );
    })
    .sort(
      (a, b) =>
        String(a[sort as keyof Action]).localeCompare(String(b[sort as keyof Action]), 'fr', {
          numeric: true,
        }) * (asc ? 1 : -1),
    );
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  const visible = filtered.slice(safePage * 10, safePage * 10 + (compact ? 5 : 10));
  const heading = (key: string, label: string) => (
    <button
      className="sort"
      onClick={() => {
        setSort(key);
        setAsc(sort === key ? !asc : true);
      }}
    >
      {label}
      <ArrowUpDown size={12} />
    </button>
  );
  return (
    <section className="table-panel">
      {!compact && (
        <>
          <div className="table-toolbar">
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Rechercher une action"
                placeholder="Rechercher une action, un objectif…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <span className="muted">
              {filtered.length} action{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          <details className="filters">
            <summary>Filtrer les actions</summary>
            <div className="filter-grid">
              {filter('client', 'Client', state.clients)}
              {filter('project', 'Projet', state.projects)}
              {filter('module', 'Module', state.modules)}
              {filter('pilot', 'Pilote', state.users)}
              {filter(
                'status',
                'Statut',
                statuses.map((s) => ({ id: s, name: s })),
              )}
              <label>
                Échéance à partir du
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
                Échéance jusqu’au
                <input
                  type="date"
                  value={filters.end || ''}
                  onChange={(e) => {
                    setFilters({ ...filters, end: e.target.value });
                    setPage(0);
                  }}
                />
              </label>
              <button
                className="secondary"
                onClick={() => {
                  setFilters({});
                  setSearch('');
                }}
              >
                Réinitialiser
              </button>
            </div>
          </details>
        </>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{heading('code', 'Action')}</th>
              <th>Projet / module</th>
              <th>Pilote</th>
              <th>{heading('planned_end', 'Échéance')}</th>
              <th>{heading('status', 'Statut')}</th>
              <th>{heading('progress', 'Avancement')}</th>
              <th>
                <span className="sr-only">Détail</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <td>
                  <button className="action-link" onClick={() => onOpen(a)}>
                    <small>{a.code}</small>
                    <strong>{a.description}</strong>
                  </button>
                </td>
                <td>
                  {projectOf(state, a)?.name}
                  <small>{state.modules.find((m) => m.id === a.module_id)?.name}</small>
                </td>
                <td>
                  <span className="avatar small">
                    {state.users.find((u) => u.id === a.pilot_id)?.name.slice(0, 1)}
                  </span>
                  {state.users.find((u) => u.id === a.pilot_id)?.name}
                </td>
                <td className={isLate(a) ? 'late' : ''}>
                  {dateFR(a.planned_end)}
                  {isLate(a) && <small>En retard</small>}
                </td>
                <td>
                  <Badge action={a} />
                </td>
                <td>
                  <div className="progress-cell">
                    <progress max={100} value={a.progress} aria-label={`Avancement ${a.code}`} />
                    <span>{a.progress} %</span>
                  </div>
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Ouvrir ${a.code}`}
                    onClick={() => onOpen(a)}
                  >
                    <ArrowRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <div className="empty">
          <h3>Aucune action à afficher</h3>
          <p>Ajoutez une action dans un module ou ajustez vos filtres.</p>
        </div>
      )}
      {!compact && (
        <footer className="pagination">
          <span>
            {filtered.length
              ? `${safePage * 10 + 1}–${Math.min((safePage + 1) * 10, filtered.length)} sur ${filtered.length}`
              : '0 résultat'}
          </span>
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
              disabled={(safePage + 1) * 10 >= filtered.length}
              onClick={() => setPage(safePage + 1)}
            >
              Suivant
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
