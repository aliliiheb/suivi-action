import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Upload, X } from 'lucide-react';
import { api } from './api';
type Document = {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size: number;
  at: string;
  author: string;
  version: number;
};
const accept = '.doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,.jpg,.jpeg,.png,.webp';
const sizeText = (size: number) =>
  size >= 1048576 ? `${(size / 1048576).toFixed(1)} Mo` : `${Math.ceil(size / 1024)} Ko`;
const contentUrl = (id: string, preview = false) =>
  `/api/plans/documents/${encodeURIComponent(id)}/content${preview ? '?preview=1' : ''}`;
export function ProjectDocuments({
  projectId,
  canManage,
  ownerKind = 'projects',
}: {
  projectId: string;
  canManage: boolean;
  ownerKind?: 'projects' | 'missions';
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Document | null>(null);
  const [rename, setRename] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestIds = useRef(new WeakMap<File, string>());
  const load = useCallback(
    async () => setDocuments(await api<Document[]>(`/${ownerKind}/${projectId}/documents`)),
    [projectId, ownerKind],
  );
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function upload(files: File[]) {
    if (!canManage || locked.current || !files.length) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let added = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!file.size || file.size > 5 * 1024 * 1024)
            throw new Error('Limite : 5 Mo par fichier, fichier non vide.');
          if (!accept.split(',').includes('.' + file.name.split('.').pop()?.toLowerCase()))
            throw new Error('Format non accepté.');
          setNotice(`Importation ${added + failures.length + 1}/${files.length} : ${file.name}`);
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
            reader.onload = () => resolve(String(reader.result).split(',')[1]!);
            reader.readAsDataURL(file);
          });
          let requestId = requestIds.current.get(file);
          if (!requestId) {
            requestId = crypto.randomUUID();
            requestIds.current.set(file, requestId);
          }
          await api(`/${ownerKind}/${projectId}/documents`, 'POST', {
            filename: file.name,
            base64,
            request_id: requestId,
          });
          added++;
        } catch (e) {
          failures.push(`${file.name} : ${(e as Error).message}`);
        }
      }
      await load();
      setNotice(`${added} document(s) ajouté(s).`);
      setError(failures.join(' · '));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function change(doc: Document, remove = false) {
    if (locked.current || (remove && !confirm(`Supprimer le document « ${doc.title} » ?`))) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/documents/${doc.id}`, remove ? 'DELETE' : 'PUT', {
        version: doc.version,
        ...(remove ? {} : { title }),
      });
      if (remove && preview?.id === doc.id) setPreview(null);
      setRename(null);
      await load();
      setNotice(remove ? 'Document supprimé.' : 'Titre enregistré.');
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel documents-panel" aria-labelledby="documents-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {ownerKind === 'missions' ? 'RESSOURCES DE LA MISSION' : 'RESSOURCES DU PROJET'}
          </span>
          <h2 id="documents-title">Documents joints</h2>
        </div>
        <FileText size={22} />
      </div>
      {canManage && (
        <div
          className={`document-drop ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(Array.from(e.dataTransfer.files));
          }}
        >
          <Upload size={24} />
          <strong>Déposez vos fichiers ici</strong>
          <span>Word, Excel, PDF, PowerPoint et images · 5 Mo par fichier · 50 Mo par fiche</span>
          <label className="secondary">
            Choisir des fichiers
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={accept}
              disabled={busy}
              onChange={(e) => void upload(Array.from(e.target.files || []))}
            />
          </label>
        </div>
      )}
      <p role="status" className="muted">
        {loading ? 'Chargement des documents…' : notice}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!loading && !documents.length && (
        <p className="empty">Aucun document joint à cette fiche.</p>
      )}
      <ul className="document-list">
        {documents.map((doc) => (
          <li key={doc.id}>
            <div className="document-info">
              <strong>{doc.title}</strong>
              <span>
                {doc.filename} · {doc.filename.split('.').pop()?.toUpperCase()} ·{' '}
                {sizeText(doc.size)}
              </span>
              <small>
                Ajouté le {new Date(doc.at).toLocaleString('fr-FR')} par {doc.author}
              </small>
            </div>
            <div className="inline document-controls">
              <a className="secondary" href={contentUrl(doc.id)}>
                <Download size={15} />
                Télécharger
              </a>
              {(doc.mime === 'application/pdf' || doc.mime.startsWith('image/')) && (
                <button className="secondary" onClick={() => setPreview(doc)}>
                  Prévisualiser
                </button>
              )}
              {canManage && (
                <>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setRename(doc);
                      setTitle(doc.title);
                    }}
                  >
                    Renommer
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void change(doc, true)}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
            {rename?.id === doc.id && (
              <form
                className="document-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  void change(doc);
                }}
              >
                <label>
                  Titre affiché
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={255}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setRename(null)}
                >
                  Annuler
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
function DocumentPreview({ document: doc, onClose }: { document: Document; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor document-preview"
      onCancel={onClose}
      aria-label={`Aperçu de ${doc.title}`}
    >
      <header>
        <h2>{doc.title}</h2>
        <button className="icon-button" aria-label="Fermer l’aperçu" onClick={onClose}>
          <X />
        </button>
      </header>
      {doc.mime.startsWith('image/') ? (
        <img src={contentUrl(doc.id, true)} alt={doc.title} />
      ) : (
        <iframe title={doc.title} src={contentUrl(doc.id, true)} />
      )}
      <p className="muted">
        Si l’aperçu n’est pas disponible, <a href={contentUrl(doc.id)}>téléchargez le document</a>.
      </p>
    </dialog>
  );
}
