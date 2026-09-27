import { useCallback, useEffect, useState } from 'react';
import { NavLink, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Route,
  Library,
  GraduationCap,
  Gem,
  Layers,
  Award,
  Sparkles,
  Plus,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import { LEARNING_KINDS, type LearningItem, type LearningKind } from '@/db/repositories/learning';
import { Button } from '@/shared/ui/components/Button';
import { Input } from '@/shared/ui/components/Input';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';

const tabs = ['overview', ...LEARNING_KINDS, 'recommendations'] as const;
const icons = [BookOpen, Route, Library, GraduationCap, Gem, Layers, Award, Sparkles];
const blank = (kind: LearningKind): LearningItem => ({
  id: '',
  kind,
  title: '',
  notes: '',
  url: '',
  current: 0,
  target: 1,
  updatedAt: 0,
});

export function LearningPage() {
  const { section = 'overview' } = useParams();
  const { t } = useTranslation();
  const { repos, commit } = useDb();
  const [items, setItems] = useState<LearningItem[]>([]);
  const [draft, setDraft] = useState<LearningItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const reload = useCallback(async () => {
    setItems(await repos.learning.list());
    setLoading(false);
  }, [repos]);
  useEffect(() => {
    void reload().catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [reload]);
  if (!tabs.some((tab) => tab === section)) return <Navigate to="/learn" replace />;
  const kind = LEARNING_KINDS.find((k) => k === section) ?? 'paths';
  const visible = items.filter((item) => section === 'overview' || item.kind === section);
  const ongoing = items.filter((item) => item.current < item.target);
  const suggestions = [...ongoing].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 3);
  const save = async (remove = false) => {
    if (!draft || busy) return;
    setBusy(true);
    setError(false);
    try {
      await commit(async () => {
        if (remove) await repos.learning.remove(draft.id);
        else await repos.learning.save(draft, draft.id || undefined);
      });
      await reload();
      setDraft(null);
      setRemoving(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-stack learning-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('learn.eyebrow')}</p>
          <h1>{t('learn.title')}</h1>
          <p className="text-fg-muted mt-2">{t('learn.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setDraft(blank(kind));
            setRemoving(false);
          }}
        >
          <Plus size={16} />
          {t('learn.add')}
        </Button>
      </div>
      <nav className="learning-tabs" aria-label={t('learn.title')}>
        {tabs.map((tab, index) => {
          const Icon = icons[index] ?? BookOpen;
          return (
            <NavLink key={tab} end to={tab === 'overview' ? '/learn/overview' : `/learn/${tab}`}>
              <Icon size={17} />
              {t(`learn.tabs.${tab}`)}
            </NavLink>
          );
        })}
      </nav>
      {error && (
        <p role="alert" className="text-danger">
          {t('common.error')}{' '}
          <Button
            variant="outline"
            onClick={() => {
              setError(false);
              void reload().catch(() => setError(true));
            }}
          >
            {t('common.retry')}
          </Button>
        </p>
      )}
      <div className="learning-banner">
        <div>
          <span className="eyebrow">{t(`learn.tabs.${section}`)}</span>
          <h2>{t(section === 'recommendations' ? 'learn.recommendTitle' : 'learn.banner')}</h2>
          <p>{t(section === 'recommendations' ? 'learn.localNotice' : 'learn.bannerText')}</p>
        </div>
        <div className="learning-count">
          <strong>
            {items.filter((item) => item.current >= item.target).length}
            <small> / {items.length}</small>
          </strong>
          <span>{t('learn.completed')}</span>
        </div>
      </div>
      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : section === 'recommendations' ? (
        <div className="learning-grid">
          {suggestions.length ? (
            suggestions.map((item) => (
              <article className="surface learning-card" key={item.id}>
                <Sparkles className="text-primary" />
                <span className="eyebrow">{t('learn.local')}</span>
                <h2>{item.title}</h2>
                <p className="text-fg-muted">{t('learn.suggestion')}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(item);
                    setRemoving(false);
                  }}
                >
                  {t('learn.resume')}
                </Button>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <Sparkles />
              <h2>{t('learn.noSuggestions')}</h2>
              <p>{t('learn.noSuggestionsText')}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-heading">{t(`learn.tabs.${section}`)}</h2>
            <span className="text-fg-muted">
              {visible.length} {t('learn.resources')}
            </span>
          </div>
          <div className="learning-grid">
            {visible.map((item) => (
              <article key={item.id} className="surface learning-card">
                <div className="flex items-center justify-between">
                  <span className="learning-badge">{t(`learn.tabs.${item.kind}`)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')} ${item.title}`}
                    onClick={() => {
                      setDraft(item);
                      setRemoving(false);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                </div>
                <h2>{item.title}</h2>
                <p className="learning-notes text-fg-muted">{item.notes}</p>
                <div className="mt-auto">
                  <div className="flex justify-between text-sm mb-2">
                    <span>
                      {item.current} / {item.target} {t(`learn.units.${item.kind}`)}
                    </span>
                    <strong>{Math.round((item.current / item.target) * 100)}%</strong>
                  </div>
                  <ProgressBar value={(item.current / item.target) * 100} />
                </div>
                {item.url && /^https?:\/\//i.test(item.url) && (
                  <a
                    className="learning-resource-link"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('learn.open')}
                    <ExternalLink size={14} />
                  </a>
                )}
              </article>
            ))}
          </div>
          {!visible.length && (
            <div className="empty-state">
              <BookOpen size={32} />
              <h2>{t('learn.empty')}</h2>
              <p>{t('learn.emptyText')}</p>
              <Button
                onClick={() => {
                  setDraft(blank(kind));
                  setRemoving(false);
                }}
              >
                {t('learn.add')}
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDraft(null);
            setRemoving(false);
          }
        }}
      >
        <DialogContent title={t(draft?.id ? 'learn.edit' : 'learn.add')}>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="block">
                {t('learn.category')}
                <select
                  className="ui-input w-full"
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as LearningKind })}
                >
                  {LEARNING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`learn.tabs.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {t('learn.name')}
                <Input
                  autoFocus
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  {t('learn.current')}
                  <Input
                    type="number"
                    min={0}
                    max={draft.target}
                    step="any"
                    required
                    value={draft.current}
                    onChange={(e) => setDraft({ ...draft, current: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {t('learn.target')}
                  <Input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={draft.target}
                    onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="text-xs text-fg-muted">
                {t('learn.unit')}: {t(`learn.units.${draft.kind}`)}
              </p>
              <label className="block">
                {t('learn.url')}
                <Input
                  type="url"
                  placeholder="https://…"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
              </label>
              <label className="block">
                {t('learn.notes')}
                <textarea
                  className="ui-input w-full"
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
              {error && (
                <p role="alert" className="text-danger">
                  {t('common.error')}
                </p>
              )}
              {removing ? (
                <div className="space-y-2">
                  <p>{t('learn.deleteConfirm')}</p>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    {t('common.delete')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRemoving(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draft.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setRemoving(true)}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDraft(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {t('common.save')}
                  </Button>
                </div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

