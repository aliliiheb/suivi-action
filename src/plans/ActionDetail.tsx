import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare, History, Plus, Trash2 } from 'lucide-react';
import { api } from './api';
import type { Action, Audit, State, Corrective } from './types';
import { dateFR, statuses, projectOf, manages, isLate } from './types';
import { Badge } from './ActionTable';
import { CopyProvenance } from './CopyProvenance';
import { MissionLink } from './MissionSelector';
import type { Kind } from './types';
export function ActionDetail({
  state,
  action,
  onBack,
  onEdit,
  onDelete,
  onRefresh,
  onDuplicate,
  onSource,
}: {
  state: State;
  action: Action;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  onDuplicate: () => void;
  onSource: (kind: Kind, id: string) => void;
}) {
  const [history, setHistory] = useState<Audit[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const project = projectOf(state, action);
  const editable =
    manages(state, project) || (state.user.role === 'PILOTE' && action.pilot_id === state.user.id);
  const load = useCallback(
    () =>
      api<Audit[]>(`/actions/${action.id}/history`)
        .then(setHistory)
        .catch((e) => setError(e.message)),
    [action.id],
  );
  useEffect(() => {
    void load();
  }, [load, action.version]);
  async function comment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    try {
      await api(`/actions/${action.id}/comments`, 'POST', {
        content: new FormData(form).get('content'),
      });
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function corrections(next: Corrective[]) {
    setBusy(true);
    setError('');
    const { id, version, ...data } = action;
    try {
      await api(`/actions/${id}`, 'PUT', { version, data: { ...data, corrective: next } });
      await onRefresh();
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Retour aux actions
      </button>
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            {project?.name} / {action.code}
          </span>
          <h1>{action.description}</h1>
          <div className="inline">
            <Badge action={action} />
            {isLate(action) && <span className="badge danger">En retard</span>}
            <span className="muted">Version {action.version}</span>
          </div>
        </div>
        {editable && (
          <div className="inline">
            {manages(state, project) && (
              <button className="secondary" onClick={onDuplicate}>
                Dupliquer l’action
              </button>
            )}
            <button className="primary" onClick={onEdit}>
              Modifier l’action
            </button>
            {manages(state, project) && (
              <button className="secondary" onClick={onDelete}>
                Supprimer
              </button>
            )}
          </div>
        )}
      </header>
      <CopyProvenance kind="actions" id={action.id} onSource={onSource} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="detail-grid">
        <section className="panel">
          <h2>Suivi de l’action</h2>
          <dl>
            <div>
              <dt>Emplacement</dt>
              <dd>
                {action.location === 'AUTRE (à préciser)'
                  ? action.location_other
                  : action.location || 'Non renseigné'}
              </dd>
            </div>
            <div>
              <dt>N° Mission</dt>
              <dd>
                <MissionLink state={state} entity={action} />
              </dd>
            </div>
            <div>
              <dt>Réf. Action Prioritaire</dt>
              <dd>{action.priority_reference || 'Non renseignée'}</dd>
            </div>
            <div>
              <dt>Pilote responsable</dt>
              <dd>{state.users.find((u) => u.id === action.pilot_id)?.name}</dd>
            </div>
            <div>
              <dt>Période prévue</dt>
              <dd>
                {dateFR(action.planned_start)} → {dateFR(action.planned_end)}
              </dd>
            </div>
            <div>
              <dt>Période réelle</dt>
              <dd>
                {dateFR(action.actual_start)} → {dateFR(action.actual_end)}
              </dd>
            </div>
            <div>
              <dt>2e échéance</dt>
              <dd>{dateFR(action.deadline_2 || '')}</dd>
            </div>
            <div>
              <dt>3e échéance</dt>
              <dd>{dateFR(action.deadline_3 || '')}</dd>
            </div>
            <div>
              <dt>Avancement du travail</dt>
              <dd>
                <progress max={100} value={action.progress} aria-label="Avancement du travail" />{' '}
                {action.progress} %
              </dd>
            </div>
          </dl>
          <h3>Cause de retard ou de non-réalisation</h3>
          <p className="pre-wrap">{action.cause || 'Aucune cause renseignée.'}</p>
        </section>
        <section className="panel">
          <h2>Atteinte de l’objectif</h2>
          <p className="pre-wrap">{action.objective || 'Objectif non renseigné.'}</p>
          {action.target === null ? (
            <div className="notice">Objectif qualitatif : aucun écart chiffré n’est calculé.</div>
          ) : (
            <>
              <div className="measurement">
                <div>
                  <small>Cible</small>
                  <strong>
                    {action.target} <em>{action.unit}</em>
                  </strong>
                </div>
                <div>
                  <small>Réalisé</small>
                  <strong>
                    {action.achieved ?? '—'} <em>{action.unit}</em>
                  </strong>
                </div>
                <div>
                  <small>Écart</small>
                  <strong>
                    {action.achieved === null
                      ? '—'
                      : Number((action.achieved - action.target).toFixed(4))}{' '}
                    <em>{action.unit}</em>
                  </strong>
                </div>
              </div>
              <p className="muted">
                Écart = valeur réalisée − valeur cible. Son signe n’indique pas automatiquement une
                réussite ou un échec.
              </p>
            </>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Actions correctives</h2>
          {editable && (
            <button className="secondary" onClick={() => setAdding(!adding)}>
              <Plus size={16} />
              Ajouter
            </button>
          )}
        </div>
        {!action.corrective.length && <p className="muted">Aucune action corrective associée.</p>}
        {action.corrective.map((c) => (
          <div className="correction" key={c.id}>
            <div>
              <strong>{c.description}</strong>
              <small>
                {state.users.find((u) => u.id === c.responsible_id)?.name} · échéance{' '}
                {dateFR(c.deadline)}
              </small>
            </div>
            <select
              aria-label={`Statut : ${c.description}`}
              disabled={!editable || busy}
              value={c.status}
              onChange={(e) =>
                void corrections(
                  action.corrective.map((item) =>
                    item.id === c.id
                      ? { ...item, status: e.target.value as Corrective['status'] }
                      : item,
                  ),
                )
              }
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {editable && (
              <button
                className="icon-button"
                aria-label="Supprimer la correction"
                onClick={() => {
                  if (confirm('Supprimer cette action corrective ?'))
                    void corrections(action.corrective.filter((item) => item.id !== c.id));
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        {adding && (
          <form
            className="form-grid inset"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void corrections([
                ...action.corrective,
                {
                  id: crypto.randomUUID(),
                  description: String(f.get('description')),
                  responsible_id: String(f.get('responsible')),
                  deadline: String(f.get('deadline')),
                  status: 'À faire',
                },
              ]);
            }}
          >
            <label className="wide">
              Description
              <input name="description" required maxLength={2000} />
            </label>
            <label>
              Responsable
              <select name="responsible" aria-label="Responsable" required>
                {state.users
                  .filter((u) => u.active && project?.members.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Échéance
              <input type="date" name="deadline" required />
            </label>
            <button className="primary" disabled={busy}>
              Enregistrer la correction
            </button>
          </form>
        )}
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>
            <MessageSquare size={19} />
            Commentaires
          </h2>
          {editable && (
            <form onSubmit={comment}>
              <label>
                Ajouter un commentaire
                <textarea
                  name="content"
                  rows={3}
                  required
                  maxLength={4000}
                  placeholder="Partagez une information utile à l’équipe…"
                />
              </label>
              <button className="primary" disabled={busy}>
                Publier le commentaire
              </button>
            </form>
          )}
          {history
            .filter((h) => h.operation === 'Commentaire')
            .map((h) => (
              <article className="comment" key={h.id}>
                <strong>{h.author}</strong>
                <small>{new Date(h.at).toLocaleString('fr-FR')}</small>
                <p className="pre-wrap">{String(h.after_data?.content)}</p>
              </article>
            ))}
        </section>
        <section className="panel">
          <h2>
            <History size={19} />
            Historique des modifications
          </h2>
          {history
            .filter((h) => h.operation !== 'Commentaire')
            .map((h) => (
              <details className="history" key={h.id}>
                <summary>
                  <strong>{h.operation}</strong> · {h.author}
                  <small>{new Date(h.at).toLocaleString('fr-FR')}</small>
                </summary>
                <dl>
                  {Object.entries(h.after_data || h.before_data || {})
                    .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(h.before_data?.[k]))
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{fieldLabels[k] || k}</dt>
                        <dd>
                          {formatValue(h.before_data?.[k])} → {formatValue(v)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            ))}
        </section>
      </div>
    </>
  );
}
const fieldLabels: Record<string, string> = {
  code: 'Code',
  description: 'Description',
  objective: 'Objectif',
  pilot_id: 'Pilote',
  module_id: 'Module',
  planned_start: 'Début prévu',
  planned_end: 'Fin prévue',
  location: 'Emplacement',
  location_other: 'Autre emplacement',
  mission_number: 'N° Mission',
  priority_reference: 'Réf. Action Prioritaire',
  deadline_2: '2e échéance',
  deadline_3: '3e échéance',
  actual_start: 'Début réel',
  actual_end: 'Fin réelle',
  status: 'Statut',
  progress: 'Avancement',
  cause: 'Cause',
  target: 'Cible',
  achieved: 'Réalisé',
  unit: 'Unité',
  corrective: 'Actions correctives',
  version: 'Version',
  id: 'Identifiant',
};
const formatValue = (v: unknown) =>
  v === undefined || v === null || v === ''
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v);
