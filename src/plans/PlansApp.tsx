import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  Building2,
  FolderKanban,
  ListChecks,
  ArrowDownUp,
  Users,
  LogOut,
  Plus,
  ArrowUpRight,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Menu,
  Trash2,
  Pencil,
} from 'lucide-react';
import { api, ApiError } from './api';
import type { State, User, Kind, Entity, Project, Action } from './types';
import { roles, statuses, average, manages, projectOf, isLate, dateFR } from './types';
import { EntityEditor } from './EntityEditor';
import { ActionTable } from './ActionTable';
import { ActionDetail } from './ActionDetail';
import { Transfers } from './Transfers';
import { ProjectDocuments } from './ProjectDocuments';
import { CopyProvenance } from './CopyProvenance';
type Editor = { kind: Kind; value?: Entity; source?: Entity; defaults?: Record<string, unknown> };
const navigation = [
  ['dashboard', 'Tableau de bord', LayoutDashboard],
  ['clients', 'Clients', Building2],
  ['projects', 'Projets', FolderKanban],
  ['actions', 'Toutes les actions', ListChecks],
  ['mine', 'Mes actions', CheckCircle2],
  ['transfers', 'Importation & exportation', ArrowDownUp],
  ['users', 'Utilisateurs', Users],
] as const;
export function PlansApp() {
  const [session, setSession] = useState<{
    user: User | null;
    columns: Record<string, string>;
  } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [projectId, setProjectId] = useState('');
  const [actionId, setActionId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const [moduleFocus, setModuleFocus] = useState('');
  useEffect(() => {
    if (moduleFocus)
      document.getElementById(`module-${moduleFocus}`)?.scrollIntoView({ block: 'start' });
  }, [moduleFocus, projectId]);
  const refresh = useCallback(async () => {
    try {
      const next = await api<State>('/state');
      setState(next);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState(null);
        setEditor(null);
        setMenu(false);
      }
      throw error;
    }
  }, []);
  const initialize = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const s = await api<{ user: User | null; columns: Record<string, string> }>('/session');
      setSession(s);
      if (s.user) await refresh();
      else setState(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const authenticated = Boolean(state);
  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [page, projectId, actionId]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        document.getElementById('plans-menu-toggle')?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 30000);
    return () => clearInterval(interval);
  }, [authenticated, refresh]);
  const navigate = (next: string) => {
    setPage(next);
    setProjectId('');
    setActionId('');
    setMenu(false);
    setError('');
  };
  async function remove(kind: Kind, value: Entity) {
    if (!confirm('Supprimer cet élément ? Ses dépendances éventuelles empêcheront la suppression.'))
      return;
    try {
      await api(`/${kind}/${value.id}`, 'DELETE', { version: value.version });
      await refresh();
      if (kind === 'projects') setProjectId('');
      if (kind === 'actions') setActionId('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <main className="boot" role="status">
        <Activity size={36} />
        <h1>PROGRESS</h1>
        <p>Chargement de votre espace de travail…</p>
      </main>
    );
  if (!state) return <Login error={error} onLogin={initialize} />;
  const selected = state.projects.find((p) => p.id === projectId);
  const action = state.actions.find((a) => a.id === actionId);
  const newProject = () =>
    setEditor({
      kind: 'projects',
      defaults: { manager_id: state.user.id, members: [state.user.id] },
    });
  const openAction = (a: Action) => {
    setActionId(a.id);
    setPage('actions');
  };
  const openSource = (kind: Kind, id: string) => {
    setActionId('');
    if (kind === 'actions') {
      setActionId(id);
      setPage('actions');
    } else {
      setPage('projects');
      setProjectId(
        kind === 'projects' ? id : state.modules.find((m) => m.id === id)?.project_id || '',
      );
      setModuleFocus(kind === 'modules' ? id : '');
    }
  };
  const startCopy = (kind: Kind, source: Entity) => {
    const { id: _id, version: _version, ...original } = source;
    const code =
      'code' in original
        ? `${original.code.slice(0, 96)}-COPIE-${crypto.randomUUID().slice(0, 8)}`
        : '';
    setEditor({
      kind,
      source,
      defaults: {
        ...original,
        code,
        ...(kind === 'actions'
          ? {
              status: 'À faire',
              progress: 0,
              actual_start: '',
              actual_end: '',
              achieved: null,
              cause: '',
              corrective: [],
            }
          : {}),
      },
    });
  };
  const editButtons = (kind: Kind, value: Entity) => (
    <div className="inline">
      {['projects', 'modules'].includes(kind) && (
        <button className="secondary" onClick={() => startCopy(kind, value)}>
          Dupliquer
        </button>
      )}
      <button
        className="icon-button"
        aria-label="Modifier"
        onClick={() => setEditor({ kind, value })}
      >
        <Pencil size={16} />
      </button>
      {kind !== 'users' && (
        <button
          className="icon-button"
          aria-label="Supprimer"
          onClick={() => void remove(kind, value)}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Fermer la navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside id="plans-sidebar" className={`sidebar ${menu ? 'open' : ''}`}>
        <a href="/plans.html" className="brand">
          <span>
            <Activity size={23} />
          </span>
          PROGRESS<small>PLANS D’ACTIONS</small>
        </a>
        <div className="workspace-label">
          <span className="workspace-mark">P</span>
          <div>
            Espace collaboratif<small>Suivi des plans d’actions</small>
          </div>
        </div>
        <p className="nav-label">ESPACE DE TRAVAIL</p>
        <nav aria-label="Navigation principale">
          {navigation
            .filter(([key]) => key !== 'users' || state.user.role === 'ADMIN')
            .map(([key, label, Icon]) => (
              <button
                key={key}
                aria-current={page === key ? 'page' : undefined}
                className={page === key ? 'active' : ''}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                {label}
                {key === 'mine' && (
                  <span className="nav-count">
                    {
                      state.actions.filter(
                        (a) => a.pilot_id === state.user.id && a.status !== 'Terminée',
                      ).length
                    }
                  </span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-note">
            <span />
            Données partagées<small>Actualisation toutes les 30 secondes</small>
          </div>
          <div className="profile">
            <span className="avatar">
              {state.user.name
                .split(' ')
                .map((v) => v[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{state.user.name}</strong>
              <small>{roles[state.user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Se déconnecter"
              onClick={async () => {
                try {
                  await api('/logout', 'POST');
                  await initialize();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Afficher la navigation"
            id="plans-menu-toggle"
            aria-controls="plans-sidebar"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>
            Vue d’ensemble <span className="crumb">/</span>{' '}
            <strong>{navigation.find(([key]) => key === page)?.[1]}</strong>
          </span>
          <div className="inline">
            <span className="today">
              {new Date().toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              className="icon-button"
              aria-label="Actualiser les données"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {notice && (
            <p className="notice" role="status">
              {notice}
              <button className="text-button" onClick={() => setNotice('')}>
                Fermer
              </button>
            </p>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => void initialize()}>
                Vérifier la connexion
              </button>
            </div>
          )}
          {action ? (
            <ActionDetail
              state={state}
              action={action}
              onBack={() => setActionId('')}
              onEdit={() => setEditor({ kind: 'actions', value: action })}
              onDelete={() => void remove('actions', action)}
              onRefresh={refresh}
              onDuplicate={() => startCopy('actions', action)}
              onSource={openSource}
            />
          ) : page === 'dashboard' ? (
            <Dashboard
              state={state}
              onAction={openAction}
              onProject={(id) => {
                setPage('projects');
                setProjectId(id);
              }}
              onNew={newProject}
              onAll={() => navigate('actions')}
            />
          ) : page === 'transfers' ? (
            <Transfers state={state} columns={session?.columns || {}} onRefresh={refresh} />
          ) : page === 'actions' || page === 'mine' ? (
            <>
              <header className="page-heading">
                <div>
                  <span className="eyebrow">PILOTAGE OPÉRATIONNEL</span>
                  <h1>{page === 'mine' ? 'Mes actions' : 'Toutes les actions'}</h1>
                  <p>
                    {page === 'mine'
                      ? 'Vos responsabilités, vos échéances et vos résultats.'
                      : 'Une vue partagée pour faire avancer vos projets.'}
                  </p>
                </div>
              </header>
              <ActionTable
                state={state}
                actions={
                  page === 'mine'
                    ? state.actions.filter((a) => a.pilot_id === state.user.id)
                    : state.actions
                }
                onOpen={openAction}
              />
            </>
          ) : page === 'projects' ? (
            selected ? (
              <>
                <button className="back" onClick={() => setProjectId('')}>
                  <ArrowLeft size={16} />
                  Tous les projets
                </button>
                <header className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {state.clients.find((c) => c.id === selected.client_id)?.name} /{' '}
                      {selected.code}
                    </span>
                    <h1>{selected.name}</h1>
                    <p>{selected.description}</p>
                  </div>
                  {manages(state, selected) && editButtons('projects', selected)}
                </header>
                <CopyProvenance kind="projects" id={selected.id} onSource={openSource} />
                <section className="panel project-meta">
                  <div>
                    <small>Période prévue</small>
                    <strong>
                      {dateFR(selected.planned_start)} → {dateFR(selected.planned_end)}
                    </strong>
                  </div>
                  <div>
                    <small>Durée prévue</small>
                    <strong>
                      {Math.round(
                        (Date.parse(selected.planned_end) - Date.parse(selected.planned_start)) /
                          86400000,
                      ) + 1}{' '}
                      jours calendaires
                    </strong>
                  </div>
                  <div>
                    <small>Chef de projet</small>
                    <strong>{state.users.find((u) => u.id === selected.manager_id)?.name}</strong>
                  </div>
                  <div>
                    <small>Membres autorisés</small>
                    <strong>
                      {selected.members
                        .map((id) => state.users.find((u) => u.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </strong>
                  </div>
                </section>
                <div className="section-heading">
                  <h2>Modules & actions</h2>
                  {manages(state, selected) && (
                    <button
                      className="primary"
                      onClick={() =>
                        setEditor({ kind: 'modules', defaults: { project_id: selected.id } })
                      }
                    >
                      <Plus size={16} />
                      Nouveau module
                    </button>
                  )}
                </div>
                {state.modules
                  .filter((m) => m.project_id === selected.id)
                  .map((m) => (
                    <section className="module-panel" key={m.id} id={`module-${m.id}`}>
                      <header>
                        <div>
                          <span className="eyebrow">{m.code}</span>
                          <h3>{m.name}</h3>
                          <p>{m.description}</p>
                          <p className="muted">
                            Module principal :{' '}
                            {m.parent_module_id
                              ? state.modules
                                  .filter((parent) => parent.id === m.parent_module_id)
                                  .map((parent) => `${parent.code} — ${parent.name}`)
                                  .join('') || 'Indisponible'
                              : 'Aucun'}
                          </p>
                        </div>
                        {manages(state, selected) && (
                          <div className="inline">
                            {editButtons('modules', m)}
                            <button
                              className="secondary"
                              onClick={() =>
                                setEditor({
                                  kind: 'actions',
                                  defaults: {
                                    module_id: m.id,
                                    pilot_id: selected.manager_id,
                                    planned_start: selected.planned_start,
                                    planned_end: selected.planned_end,
                                    status: 'À faire',
                                    progress: 0,
                                  },
                                })
                              }
                            >
                              <Plus size={16} />
                              Ajouter une action
                            </button>
                          </div>
                        )}
                      </header>
                      <CopyProvenance kind="modules" id={m.id} onSource={openSource} />
                      <ActionTable
                        state={state}
                        actions={state.actions.filter((a) => a.module_id === m.id)}
                        onOpen={openAction}
                      />
                    </section>
                  ))}
                {!state.modules.some((m) => m.project_id === selected.id) && (
                  <div className="empty">
                    <h3>Le plan est prêt à être structuré</h3>
                    <p>Créez un premier module, puis ajoutez vos actions.</p>
                  </div>
                )}
                <ProjectDocuments
                  key={selected.id}
                  projectId={selected.id}
                  canManage={manages(state, selected)}
                />
              </>
            ) : (
              <>
                <header className="page-heading">
                  <div>
                    <span className="eyebrow">PORTEFEUILLE</span>
                    <h1>Vos projets</h1>
                    <p>Organisez les priorités, mobilisez les équipes.</p>
                  </div>
                  {state.user.role !== 'PILOTE' && (
                    <button
                      className="primary"
                      disabled={!state.clients.length}
                      onClick={newProject}
                    >
                      <Plus size={17} />
                      Nouveau projet
                    </button>
                  )}
                </header>
                <ProjectList state={state} onOpen={setProjectId} />
                {!state.clients.length && (
                  <p className="notice">
                    Un administrateur doit créer un client avant le premier projet.
                  </p>
                )}
              </>
            )
          ) : page === 'clients' ? (
            <>
              <header className="page-heading">
                <div>
                  <span className="eyebrow">RÉPERTOIRE</span>
                  <h1>Clients</h1>
                  <p>Les organisations accompagnées par votre équipe.</p>
                </div>
                {state.user.role === 'ADMIN' && (
                  <button className="primary" onClick={() => setEditor({ kind: 'clients' })}>
                    <Plus size={17} />
                    Nouveau client
                  </button>
                )}
              </header>
              <Directory
                items={state.clients.map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: c.code,
                  description: c.contact,
                  extra: `${state.projects.filter((p) => p.client_id === c.id).length} projet(s)`,
                  controls: state.user.role === 'ADMIN' ? editButtons('clients', c) : null,
                }))}
              />
            </>
          ) : page === 'users' ? (
            <>
              <header className="page-heading">
                <div>
                  <span className="eyebrow">ADMINISTRATION</span>
                  <h1>Utilisateurs</h1>
                  <p>Gérez les comptes et leurs responsabilités.</p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    setEditor({ kind: 'users', defaults: { role: 'PILOTE', active: true } })
                  }
                >
                  <Plus size={17} />
                  Nouvel utilisateur
                </button>
              </header>
              <Directory
                items={state.users.map((u) => ({
                  id: u.id,
                  title: u.name,
                  subtitle: roles[u.role],
                  description: u.email,
                  extra: u.active ? 'Compte actif' : 'Compte désactivé',
                  controls: editButtons('users', u),
                }))}
              />
            </>
          ) : null}
          <footer className="page-footer">
            PROGRESS · Chaque action compte.<span>Dates affichées au format français</span>
          </footer>
        </main>
      </div>
      {editor && (
        <EntityEditor
          {...editor}
          state={state}
          onClose={() => setEditor(null)}
          onSaved={async (saved) => {
            await refresh();
            if (editor.source && saved) {
              setNotice('La copie a été créée. La fiche originale reste inchangée.');
              setActionId('');
              if (editor.kind === 'projects') {
                setPage('projects');
                setProjectId(saved.id);
              } else if (editor.kind === 'modules' && 'project_id' in saved) {
                setPage('projects');
                setProjectId(saved.project_id);
                setModuleFocus(saved.id);
              } else if (editor.kind === 'actions') {
                setPage('actions');
                setActionId(saved.id);
              }
            }
          }}
        />
      )}
    </div>
  );
}
function Login({ error: outer, onLogin }: { error: string; onLogin: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api('/session');
      await api('/login', 'POST', data);
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span>
            <Activity size={24} />
          </span>
          PROGRESS
        </div>
        <div>
          <span className="eyebrow">DE L’INTENTION À L’ACTION</span>
          <h1>
            Des plans clairs.
            <br />
            Des équipes alignées.
            <br />
            Des résultats suivis.
          </h1>
          <p>
            Un espace commun pour organiser les actions, suivre les engagements et avancer ensemble.
          </p>
          <div className="login-line">
            <span>01 / Organiser</span>
            <span>02 / Agir</span>
            <span>03 / Mesurer</span>
          </div>
        </div>
        <small>Votre espace de pilotage collaboratif</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <span className="eyebrow">BIENVENUE DANS VOTRE ESPACE</span>
          <h2>Se connecter</h2>
          <p>Retrouvez vos projets et les actions de votre équipe.</p>
          <label>
            Adresse électronique
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="prenom@entreprise.fr"
            />
          </label>
          <label>
            Mot de passe
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {(error || outer) && (
            <p className="error" role="alert">
              {error || outer}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Connexion…' : 'Accéder à mon espace'}
            <ArrowUpRight size={18} />
          </button>
          <p className="muted">Besoin d’un accès ? Contactez votre administrateur.</p>
        </form>
      </section>
    </main>
  );
}
function Dashboard({
  state,
  onAction,
  onProject,
  onNew,
  onAll,
}: {
  state: State;
  onAction: (a: Action) => void;
  onProject: (id: string) => void;
  onNew: () => void;
  onAll: () => void;
}) {
  const late = state.actions.filter(isLate);
  const completed = state.actions.filter((a) => a.status === 'Terminée');
  const next = state.actions
    .filter((a) => a.status !== 'Terminée' && !isLate(a))
    .sort((a, b) => a.planned_end.localeCompare(b.planned_end));
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">VOTRE ACTIVITÉ EN UN COUP D’ŒIL</span>
          <h1>Tableau de bord</h1>
          <p>Bonjour {state.user.name.split(' ')[0]}, faisons avancer vos projets.</p>
        </div>
        {state.user.role !== 'PILOTE' && (
          <button className="primary" disabled={!state.clients.length} onClick={onNew}>
            <Plus size={18} />
            Nouveau projet
          </button>
        )}
      </header>
      <section className="overview-banner">
        <div>
          <span className="eyebrow">GARDER LE CAP, ENSEMBLE</span>
          <h2>Des engagements aux résultats.</h2>
          <p>
            {state.projects.length} projet(s) suivi(s) · {state.actions.length} action(s) pour
            concrétiser vos objectifs.
          </p>
        </div>
        <div className="banner-result">
          <strong>
            {average(state.actions) ?? '—'}
            <small>{state.actions.length ? ' %' : ''}</small>
          </strong>
          <span>Avancement moyen des actions</span>
        </div>
      </section>
      <div className="stats">
        {[
          ...statuses.map((s, i) => ({
            label: s,
            value: state.actions.filter((a) => a.status === s).length,
            icon: [ListChecks, Clock3, CheckCircle2, AlertCircle][i]!,
            className: `stat-${i}`,
          })),
          { label: 'En retard', value: late.length, icon: AlertCircle, className: 'stat-late' },
        ].map((s) => (
          <article className={`stat ${s.className}`} key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={18} />
            </div>
            <strong>{s.value.toString().padStart(2, '0')}</strong>
            <small>{s.label === 'En retard' ? 'Échéance dépassée, non terminée' : 'actions'}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">L’ESSENTIEL</span>
              <h2>Vos projets en cours</h2>
            </div>
            <FolderKanban size={20} />
          </div>
          <ProjectList state={state} onOpen={onProject} compact />
          <p className="calculation">
            Avancement = moyenne simple des actions, tous modules confondus. Un projet sans action
            affiche « — ».
          </p>
        </section>
        <section className="panel deadlines">
          <div className="section-heading">
            <div>
              <span className="eyebrow">À L’HORIZON</span>
              <h2>Prochaines échéances</h2>
            </div>
            <Clock3 size={20} />
          </div>
          {next.slice(0, 4).map((a) => (
            <button className="deadline" key={a.id} onClick={() => onAction(a)}>
              <span className="date-block">
                <strong>{new Date(a.planned_end).getUTCDate()}</strong>
                <small>
                  {new Date(a.planned_end).toLocaleDateString('fr-FR', {
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </small>
              </span>
              <span>
                <strong>{a.description}</strong>
                <small>{projectOf(state, a)?.name}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!next.length && <p className="muted">Aucune échéance à venir.</p>}
          <div className="completion-note">
            <CheckCircle2 size={20} />
            <span>
              {completed.length} action(s) terminée(s)
              <small>Chaque réalisation fait progresser le collectif.</small>
            </span>
          </div>
        </section>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">POINTS D’ATTENTION</span>
          <h2>{late.length ? 'Les actions à relancer' : 'Les actions à suivre'}</h2>
        </div>
        <button className="text-button" onClick={onAll}>
          Voir toutes les actions <ArrowUpRight size={16} />
        </button>
      </div>
      <ActionTable
        state={state}
        actions={late.length ? late : state.actions.filter((a) => a.status !== 'Terminée')}
        onOpen={onAction}
        compact
      />
    </>
  );
}
function ProjectList({
  state,
  onOpen,
  compact = false,
}: {
  state: State;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState('name');
  const filtered = state.projects
    .filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      a[order as keyof Pick<Project, 'name' | 'planned_end'>].localeCompare(
        b[order as keyof Pick<Project, 'name' | 'planned_end'>],
      ),
    );
  const visible = compact ? filtered.slice(0, 4) : filtered.slice(page * 10, page * 10 + 10);
  return (
    <>
      {!compact && (
        <div className="table-toolbar">
          <label>
            Rechercher un projet
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Trier par
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="name">Nom</option>
              <option value="planned_end">Échéance</option>
            </select>
          </label>
        </div>
      )}
      <div className={compact ? 'project-list' : 'project-cards'}>
        {visible.map((p) => {
          const actions = state.actions.filter((a) => projectOf(state, a)?.id === p.id);
          const progress = average(actions);
          return (
            <button className="project-card" key={p.id} onClick={() => onOpen(p.id)}>
              <div className="project-icon">
                <FolderKanban size={21} />
              </div>
              <div className="project-info">
                <small>
                  {state.clients.find((c) => c.id === p.client_id)?.name} · {p.code}
                </small>
                <strong>{p.name}</strong>
                <span>
                  {actions.length} actions · échéance {dateFR(p.planned_end)}
                </span>
              </div>
              <div className="project-progress">
                <strong>{progress === null ? '—' : progress + ' %'}</strong>
                <progress max={100} value={progress ?? 0} aria-label={`Avancement ${p.name}`} />
              </div>
              <ArrowUpRight size={17} />
            </button>
          );
        })}
      </div>
      {!visible.length && (
        <div className="empty">
          <h3>Aucun projet à afficher</h3>
          <p>Les projets auxquels vous avez accès apparaîtront ici.</p>
        </div>
      )}
      {!compact && (
        <footer className="pagination">
          <span>{filtered.length} projet(s)</span>
          <div>
            <button className="secondary" disabled={!page} onClick={() => setPage(page - 1)}>
              Précédent
            </button>
            <button
              className="secondary"
              disabled={(page + 1) * 10 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </button>
          </div>
        </footer>
      )}
    </>
  );
}
function Directory({
  items,
}: {
  items: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    extra: string;
    controls: React.ReactNode;
  }[];
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [asc, setAsc] = useState(true);
  const filtered = items
    .filter((i) =>
      `${i.title} ${i.description} ${i.subtitle}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'fr') * (asc ? 1 : -1));
  return (
    <section className="panel">
      <div className="table-toolbar">
        <label>
          Rechercher
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button className="secondary" onClick={() => setAsc(!asc)}>
          Nom {asc ? 'A → Z' : 'Z → A'}
        </button>
      </div>
      {filtered.slice(page * 10, page * 10 + 10).map((i) => (
        <article className="directory-item" key={i.id}>
          <span className="avatar">{i.title.slice(0, 1)}</span>
          <div>
            <small>{i.subtitle}</small>
            <h3>{i.title}</h3>
            <p>{i.description}</p>
          </div>
          <span className="muted">{i.extra}</span>
          {i.controls}
        </article>
      ))}
      {!filtered.length && <div className="empty">Aucun élément à afficher.</div>}
      <footer className="pagination">
        <span>{filtered.length} résultat(s)</span>
        <div>
          <button className="secondary" disabled={!page} onClick={() => setPage(page - 1)}>
            Précédent
          </button>
          <button
            className="secondary"
            disabled={(page + 1) * 10 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Suivant
          </button>
        </div>
      </footer>
    </section>
  );
}
