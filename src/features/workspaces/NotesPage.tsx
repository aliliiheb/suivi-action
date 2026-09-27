import { useWords } from '@/features/workspaces/useWords';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Brain, FileText, Lightbulb, Link2, Search, Plus, Folder, BookOpen } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { KnowledgeNote } from '@/db/repositories/workspace';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { LearningItem } from '@/db/repositories/learning';
import { Button } from '@/shared/ui/components/Button';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { StudioPanel, StudioScene, StudioMeter } from './Studio';
const empty = { title: '', body: '', kind: 'note' as const, folder: '', goalId: '', url: '' };
export function NotesPage() {
  const [params, setParams] = useSearchParams();
  const requestedNote = params.get('note');
  const w = useWords();
  const { repos, commit } = useDb();
  const [notes, setNotes] = useState<KnowledgeNote[]>([]),
    [goals, setGoals] = useState<GoalWithArea[]>([]),
    [books, setBooks] = useState<LearningItem[]>([]);
  const [draft, setDraft] = useState<
    (Omit<typeof empty, 'kind'> & { kind: KnowledgeNote['kind']; id?: string }) | null
  >(null);
  const [search, setSearch] = useState(''),
    [folder, setFolder] = useState(''),
    [view, setView] = useState('graph'),
    [kind, setKind] = useState('all'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [removing, setRemoving] = useState(false);
  const reload = useCallback(async () => {
    const [n, g, b] = await Promise.all([
      repos.workspace.notes(),
      repos.goals.list(),
      repos.learning.list(),
    ]);
    setNotes(n);
    setGoals(g);
    setBooks(b.filter((x) => x.kind === 'books'));
  }, [repos]);
  useEffect(() => {
    void reload().catch(() => setError(true));
  }, [reload]);
  useEffect(() => {
    const n = notes.find((n) => n.id === requestedNote);
    if (n) {
      setDraft(n);
      setRemoving(false);
    }
  }, [notes, requestedNote]);
  const folders = [...new Set(notes.map((n) => n.folder).filter(Boolean))];
  const visible = notes.filter(
    (n) =>
      (!folder || n.folder === folder) &&
      (kind === 'all' || n.kind === kind) &&
      `${n.title} ${n.body} ${n.folder}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const save = async (remove = false) => {
    if (!draft) return;
    setBusy(true);
    setError(false);
    try {
      await commit(async () => {
        if (remove && draft.id) await repos.workspace.remove('note', draft.id);
        else await repos.workspace.saveNote(draft);
      });
      await reload();
      setParams({}, { replace: true });
      setDraft(null);
      setRemoving(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const newNote = (kind: KnowledgeNote['kind'] = 'note') => {
    setDraft({ ...empty, kind, folder });
    setRemoving(false);
  };
  return (
    <div className="atelier-page notes-atelier">
      <header className="atelier-title">
        <div>
          <h1>{w('Mon Second Brain', 'My Second Brain', 'عقلي الثاني')}</h1>
          <p>
            {w(
              'Capture. Organise. Connecte. Retrouve.',
              'Capture. Organize. Connect. Rediscover.',
              'دوّن. نظّم. اربط. استرجع.',
            )}
          </p>
        </div>
        <Button onClick={() => newNote()}>
          <Plus size={16} />
          {w('Nouvelle note', 'New note', 'ملاحظة جديدة')}
        </Button>
      </header>
      <div className="atelier-toolbar">
        <div className="atelier-tabs">
          {[
            ['graph', w('Vue Graphe', 'Graph', 'الرسم')],
            ['list', w('Liste', 'List', 'قائمة')],
            ['folders', w('Dossiers', 'Folders', 'مجلدات')],
            ['timeline', w('Chronologie', 'Timeline', 'التسلسل الزمني')],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={view === id} onClick={() => setView(id!)}>
              {label}
            </button>
          ))}
        </div>
        <label className="atelier-search">
          <Search size={17} />
          <input
            aria-label={w('Rechercher mes notes', 'Search notes', 'بحث في الملاحظات')}
            placeholder={w(
              'Rechercher dans mes connaissances…',
              'Search my knowledge…',
              'ابحث في معارفي…',
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert">
          {w(
            'Impossible de charger ou enregistrer. Réessayez.',
            'Unable to load or save. Please retry.',
            'تعذر التحميل أو الحفظ. حاول مجدداً.',
          )}{' '}
          <button
            aria-label={w('Réessayer', 'Retry', 'إعادة المحاولة')}
            onClick={() =>
              void reload()
                .then(() => setError(false))
                .catch(() => setError(true))
            }
          >
            ↻
          </button>
        </p>
      )}
      <div className="atelier-three notes-composition">
        <aside className="atelier-stack">
          <StudioPanel title={w('Capture rapide', 'Quick capture', 'تدوين سريع')}>
            <p>
              {w('Une idée mérite une place.', 'Give your ideas a home.', 'امنح أفكارك مكاناً.')}
            </p>
            <div className="atelier-tiles">
              {[
                ['note', FileText, w('Note', 'Note', 'ملاحظة')],
                ['idea', Lightbulb, w('Idée', 'Idea', 'فكرة')],
                ['link', Link2, w('Lien', 'Link', 'رابط')],
              ].map(([id, Icon, label]) => {
                const I = Icon as typeof FileText;
                return (
                  <button key={String(id)} onClick={() => newNote(id as KnowledgeNote['kind'])}>
                    <I size={22} />
                    {String(label)}
                  </button>
                );
              })}
              <Link to="/inbox">
                <Plus />
                {w('Tâche', 'Task', 'مهمة')}
              </Link>
            </div>
          </StudioPanel>
          <StudioPanel title={w('Ma bibliothèque', 'My library', 'مكتبتي')}>
            <div className="atelier-menu">
              {[
                ['all', w('Toutes les captures', 'All captures', 'كل التدوينات')],
                ['note', w('Notes', 'Notes', 'ملاحظات')],
                ['idea', w('Idées', 'Ideas', 'أفكار')],
                ['link', w('Liens', 'Links', 'روابط')],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={kind === id} onClick={() => setKind(id!)}>
                  {label}
                  <b>{id === 'all' ? notes.length : notes.filter((n) => n.kind === id).length}</b>
                </button>
              ))}
            </div>
          </StudioPanel>
        </aside>
        <div className="atelier-stack">
          {view === 'graph' && !search && (
            <StudioScene
              image="knowledge"
              title={w('Mon Savoir', 'My Knowledge', 'معارفي')}
              subtitle={w(
                'Chaque idée peut en éclairer une autre.',
                'Every idea can illuminate another.',
                'كل فكرة قد تنير فكرة أخرى.',
              )}
            >
              <div className="atelier-islands">
                {folders.slice(0, 6).map((f) => (
                  <button
                    key={f}
                    aria-pressed={folder === f}
                    onClick={() => setFolder(folder === f ? '' : f)}
                  >
                    <Folder size={19} />
                    {f}
                    <small>
                      {notes.filter((n) => n.folder === f).length} {w('notes', 'notes', 'ملاحظات')}
                    </small>
                  </button>
                ))}
              </div>
            </StudioScene>
          )}
          {view === 'folders' && (
            <div className="atelier-folder-grid">
              {folders.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFolder(f);
                    setView('list');
                  }}
                >
                  <Folder />
                  {f}
                  <small>{notes.filter((n) => n.folder === f).length}</small>
                </button>
              ))}
            </div>
          )}
          <StudioPanel title={folder || w('Notes récentes', 'Recent notes', 'ملاحظات حديثة')}>
            <div className="atelier-note-list">
              {folder && (
                <button className="atelier-link" onClick={() => setFolder('')}>
                  {w('Tous les dossiers', 'All folders', 'كل المجلدات')} ×
                </button>
              )}
              {!visible.length && (
                <div className="atelier-empty">
                  <Brain size={32} />
                  <p>
                    {w(
                      'Votre bibliothèque commence avec une première note.',
                      'Your library starts with a first note.',
                      'ابدأ مكتبتك بملاحظة أولى.',
                    )}
                  </p>
                  <Button onClick={() => newNote()}>
                    {w('Écrire une note', 'Write a note', 'اكتب ملاحظة')}
                  </Button>
                </div>
              )}
              {visible.map((n) => (
                <button
                  className="atelier-note"
                  key={n.id}
                  onClick={() => {
                    setDraft(n as typeof draft);
                    setRemoving(false);
                  }}
                >
                  <span className="atelier-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{n.title}</strong>
                    <small>
                      {n.folder || w('Sans dossier', 'Unfiled', 'دون مجلد')}
                      {view === 'timeline' && ` · ${new Date(n.updatedAt).toLocaleDateString()}`}
                    </small>
                    <p>{n.body.slice(0, 100)}</p>
                  </span>
                  {n.goalId && <Link2 size={15} />}
                </button>
              ))}
            </div>
          </StudioPanel>
        </div>
        <aside className="atelier-stack">
          <StudioPanel
            title={w('Connexions avec mes objectifs', 'Connected goals', 'روابط مع أهدافي')}
          >
            <p>
              {w(
                'Relie une note à un objectif depuis son éditeur.',
                'Link a note to a goal in its editor.',
                'اربط الملاحظة بهدف من المحرر.',
              )}
            </p>
            {goals
              .filter((g) => notes.some((n) => n.goalId === g.id))
              .map((g) => (
                <Link className="atelier-row" key={g.id} to={`/goals/${g.id}`}>
                  <Link2 size={16} />
                  <span>
                    {g.title}
                    <small>
                      {notes.filter((n) => n.goalId === g.id).length}{' '}
                      {w('notes liées', 'linked notes', 'ملاحظات مرتبطة')}
                    </small>
                  </span>
                </Link>
              ))}
          </StudioPanel>
          <StudioPanel
            title={w('Livres en cours', 'Books in progress', 'كتب قيد القراءة')}
            link="/learn/books"
          >
            {books
              .filter((b) => b.current < b.target)
              .slice(0, 4)
              .map((b) => (
                <Link className="atelier-row" to="/learn/books" key={b.id}>
                  <BookOpen />
                  <span>
                    {b.title}
                    <StudioMeter value={(b.current / b.target) * 100} />
                    <small>
                      {b.current} / {b.target}
                    </small>
                  </span>
                </Link>
              ))}
            {!books.length && (
              <Link to="/learn/books">
                {w('Ajouter mon premier livre →', 'Add my first book →', 'أضف كتابي الأول ←')}
              </Link>
            )}
          </StudioPanel>
          <div className="atelier-quote">
            {w(
              'Un esprit organisé pour une vie alignée.',
              'An organized mind for a purposeful life.',
              'فكر منظم لحياة ذات معنى.',
            )}
          </div>
        </aside>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setDraft(null);
            setParams({}, { replace: true });
          }
        }}
      >
        <DialogContent title={w('Ma note', 'My note', 'ملاحظتي')}>
          {draft && (
            <form
              className="atelier-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                {w('Titre', 'Title', 'العنوان')}
                <input
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label>
                {w('Type', 'Type', 'النوع')}
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as KnowledgeNote['kind'] })
                  }
                >
                  <option value="note">{w('Note', 'Note', 'ملاحظة')}</option>
                  <option value="idea">{w('Idée', 'Idea', 'فكرة')}</option>
                  <option value="link">{w('Lien', 'Link', 'رابط')}</option>
                </select>
              </label>
              <label>
                {w('Contenu', 'Content', 'المحتوى')}
                <textarea
                  rows={5}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </label>
              <label>
                {w('Dossier', 'Folder', 'المجلد')}
                <input
                  maxLength={80}
                  list="note-folders"
                  value={draft.folder}
                  onChange={(e) => setDraft({ ...draft, folder: e.target.value })}
                />
                <datalist id="note-folders">
                  {folders.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </datalist>
              </label>
              <label>
                {w('Objectif lié', 'Linked goal', 'الهدف المرتبط')}
                <select
                  value={draft.goalId}
                  onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}
                >
                  <option value="">—</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                URL
                <input
                  type="url"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
              </label>
              {/^https?:\/\//.test(draft.url) && (
                <a href={draft.url} target="_blank" rel="noreferrer">
                  {w('Ouvrir le lien ↗', 'Open link ↗', 'فتح الرابط ↗')}
                </a>
              )}
              {error && (
                <p role="alert">
                  {w(
                    'Enregistrement impossible. Vérifiez les champs.',
                    'Unable to save. Check the fields.',
                    'تعذر الحفظ. تحقق من الحقول.',
                  )}
                </p>
              )}
              <div className="atelier-actions">
                <Button disabled={busy} type="submit">
                  {w('Enregistrer', 'Save', 'حفظ')}
                </Button>
                {draft.id && (
                  <Button
                    disabled={busy}
                    type="button"
                    variant="outline"
                    onClick={() => setRemoving(true)}
                  >
                    {w('Supprimer', 'Delete', 'حذف')}
                  </Button>
                )}
              </div>
              {removing && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  {w('Confirmer la suppression', 'Confirm deletion', 'تأكيد الحذف')}
                </Button>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
