import { useEffect, useState } from 'react';
import { Download, Upload, FileSpreadsheet, FileText, Check } from 'lucide-react';
import { api } from './api';
import type { Action, State } from './types';
type FileData = { headers: string[]; rows: string[][]; mapping: Record<string, string> };
type Entry = {
  line: number;
  state: string;
  errors: string[];
  data: Action | null;
  current: Action | null;
  expectedVersion: number | null;
  candidates?: { id: string; code: string; module_id: string }[];
};
type Preview = { id: string; entries: Entry[] };
type Report = {
  id: string;
  filename: string;
  state: string;
  at: string;
  data: { results?: { line: number; result: string }[] };
};
export function Transfers({
  state,
  columns,
  onRefresh,
}: {
  state: State;
  columns: Record<string, string>;
  onRefresh: () => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(state.projects[0]?.id || '');
  const [file, setFile] = useState<FileData | null>(null);
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const loadReports = () =>
    api<Report[]>('/imports')
      .then(setReports)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void loadReports();
  }, []);
  async function read(selected?: File) {
    if (!selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    setFile(null);
    setMatches({});
    setDecisions({});
    try {
      if (selected.size > 5 * 1024 * 1024) throw new Error('Le fichier dépasse 5 Mo.');
      const bytes = new Uint8Array(await selected.arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      const data = await api<FileData>('/imports/read', 'POST', {
        filename: selected.name,
        base64: btoa(binary),
      });
      setFile(data);
      setFilename(selected.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await api<Preview>('/imports/preview', 'POST', { projectId, filename, ...file, matches }),
      );
      setDecisions({});
      await loadReports();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ results: unknown[] }>(`/imports/${preview!.id}/commit`, 'POST', {
        decisions,
      });
      setMessage(
        `Import validé : ${result.results.length} lignes traitées. Le compte rendu est enregistré.`,
      );
      setPreview(null);
      setFile(null);
      await onRefresh();
      await loadReports();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const download = async (format: string, template = false) => {
    setError('');
    try {
      const response = await fetch(
        `/api/plans/projects/${projectId}/export/${format}${template ? '?template=1' : ''}`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${template ? 'modele' : 'plan'}-${state.projects.find((p) => p.id === projectId)?.code}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">DONNÉES & DOCUMENTS</span>
          <h1>Importation & exportation</h1>
          <p>Un plan à jour, dans l’application comme dans vos documents.</p>
        </div>
      </header>
      <section className="panel">
        <label className="project-select">
          Projet concerné
          <select
            aria-label="Projet concerné"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPreview(null);
            }}
          >
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {!state.projects.length && (
        <div className="notice">Créez un projet et un module avant de préparer vos documents.</div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          <Check size={18} />
          {message}
        </p>
      )}
      <div className="detail-grid">
        <section className="panel">
          <h2>
            <Download size={20} />
            Exporter le plan
          </h2>
          <p>
            Les identifiants et versions permettent une réimportation contrôlée. Conservez-les dans
            les fichiers modifiés.
          </p>
          <div className="export-buttons">
            <button
              className="secondary"
              disabled={!projectId}
              onClick={() => void download('xlsx')}
            >
              <FileSpreadsheet />
              Excel .xlsx
            </button>
            <button
              className="secondary"
              disabled={!projectId}
              onClick={() => void download('docx')}
            >
              <FileText />
              Word .docx
            </button>
          </div>
          <h3>Modèles standardisés</h3>
          <div className="inline">
            <button
              className="text-button"
              disabled={!projectId}
              onClick={() => void download('xlsx', true)}
            >
              Modèle Excel
            </button>
            <button
              className="text-button"
              disabled={!projectId}
              onClick={() => void download('docx', true)}
            >
              Modèle Word
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>
            <Upload size={20} />
            Importer un fichier
          </h2>
          <p>Excel ou tableaux Word structurés. Maximum 5 Mo et 1 000 actions par import.</p>
          <label className="upload">
            Choisir un fichier .xlsx ou .docx
            <input
              type="file"
              accept=".xlsx,.docx"
              disabled={!projectId || busy}
              onChange={(e) => void read(e.target.files?.[0])}
            />
          </label>
          <p className="muted">
            Les documents Word libres ne sont pas extraits automatiquement. Utilisez le modèle
            standard. Les actions absentes du fichier sont conservées.
          </p>
        </section>
      </div>
      {busy && <p role="status">Traitement en cours…</p>}
      {file && (
        <section className="panel">
          <span className="eyebrow">ÉTAPE 1 · ASSOCIER LES CHAMPS</span>
          <h2>{filename}</h2>
          <p>
            {file.rows.length} lignes détectées. Un champ non associé conserve sa valeur pour une
            action existante.
          </p>
          <div className="mapping-grid">
            {Object.entries(columns).map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={file.mapping[key] || ''}
                  onChange={(e) => {
                    setFile({ ...file, mapping: { ...file.mapping, [key]: e.target.value } });
                    setPreview(null);
                  }}
                >
                  <option value="">Non associé</option>
                  {file.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <details>
            <summary>Aperçu des cinq premières lignes</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {file.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {file.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {file.headers.map((h, j) => (
                        <td key={h}>{r[j]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <button className="primary" disabled={busy} onClick={() => void analyze()}>
            Analyser les créations et modifications
          </button>
        </section>
      )}
      {preview && (
        <section className="panel">
          <span className="eyebrow">ÉTAPE 2 · VÉRIFIER ET VALIDER</span>
          <h2>Aperçu des changements</h2>
          <p>
            En cas de conflit, comparez les valeurs et choisissez explicitement la version du
            fichier ou ignorez la ligne.
          </p>
          {preview.entries.map((e) => (
            <div className="import-row" key={e.line}>
              <div className="section-heading">
                <strong>
                  Ligne {e.line} · {e.data?.code || 'À vérifier'}
                </strong>
                <span
                  className={`badge ${e.state === 'error' || e.state === 'conflict' ? 'danger' : ''}`}
                >
                  {
                    (
                      {
                        create: 'Création',
                        update: 'Modification',
                        conflict: 'Conflit de version',
                        confirm: 'Correspondance à confirmer',
                        error: 'Erreur',
                      } as Record<string, string>
                    )[e.state]
                  }
                </span>
              </div>
              {e.errors.map((err) => (
                <p className="late" key={err}>
                  {err}
                </p>
              ))}
              {e.candidates && (
                <label>
                  Correspondance
                  <select
                    value={matches[e.line - 2] || ''}
                    onChange={(event) =>
                      setMatches({ ...matches, [e.line - 2]: event.target.value })
                    }
                  >
                    <option value="">Sélectionner une action puis relancer l’analyse</option>
                    {e.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} / {state.modules.find((m) => m.id === c.module_id)?.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {e.data && (
                <details>
                  <summary>
                    Comparer les valeurs {e.current ? `(application v${e.expectedVersion})` : ''}
                  </summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Champ</th>
                          <th>Application</th>
                          <th>Fichier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(columns)
                          .filter(([key]) => !['id', 'version'].includes(key))
                          .map(([key, label]) => (
                            <tr key={key}>
                              <th>{label}</th>
                              <td>{show(e.current?.[key as keyof Action])}</td>
                              <td>{show(e.data?.[key as keyof Action])}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <label>
                Décision
                <select
                  value={decisions[e.line] || 'apply'}
                  onChange={(event) => setDecisions({ ...decisions, [e.line]: event.target.value })}
                >
                  <option value="apply">
                    {e.state === 'conflict' || e.state === 'confirm'
                      ? 'Choisir une résolution…'
                      : 'Appliquer la ligne'}
                  </option>
                  {['conflict', 'confirm'].includes(e.state) && (
                    <option value="overwrite">Confirmer les valeurs du fichier</option>
                  )}
                  <option value="skip">Ignorer cette ligne</option>
                </select>
              </label>
            </div>
          ))}
          <button
            className="primary"
            disabled={
              busy ||
              preview.entries.some(
                (e) =>
                  (e.state === 'error' && decisions[e.line] !== 'skip') ||
                  (['conflict', 'confirm'].includes(e.state) &&
                    !['overwrite', 'skip'].includes(decisions[e.line] || '')),
              )
            }
            onClick={() => void commit()}
          >
            Valider l’importation
          </button>
        </section>
      )}
      <section className="panel">
        <h2>Comptes rendus d’importation</h2>
        {!reports.length && <p className="muted">Aucune importation pour le moment.</p>}
        {reports.map((r) => (
          <details key={r.id} className="history">
            <summary>
              {r.filename} · {r.state === 'committed' ? 'Validé' : 'Aperçu préparé'}
              <small>{new Date(r.at).toLocaleString('fr-FR')}</small>
            </summary>
            {r.data.results?.map((result) => (
              <p key={result.line}>
                Ligne {result.line} : {result.result}
              </p>
            )) || <p>Import non validé. Aucune action modifiée.</p>}
          </details>
        ))}
      </section>
    </>
  );
}
const show = (v: unknown) =>
  v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
