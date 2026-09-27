import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Plus, Pencil, Archive, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { LifeArea } from '@/db/repositories/lifeAreas';
import { Button } from '@/shared/ui/components/Button';
import { EmptyState } from '@/shared/ui/components/EmptyState';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { AreaFormDialog, type AreaFormValues } from './AreaFormDialog';

export function AreasPage() {
  const { t } = useTranslation();
  const { repos, commit } = useDb();

  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LifeArea | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LifeArea | null>(null);

  const reload = useCallback(async () => {
    setAreas(await repos.lifeAreas.list());
    setLoading(false);
  }, [repos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (area: LifeArea) => {
    setEditing(area);
    setFormOpen(true);
  };

  const submitForm = async (values: AreaFormValues) => {
    if (editing) {
      await commit(() => repos.lifeAreas.update(editing.id, values));
    } else {
      await commit(() => repos.lifeAreas.create(values));
    }
    await reload();
  };

  const archive = async (area: LifeArea) => {
    await commit(() => repos.lifeAreas.archive(area.id));
    await reload();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    await commit(() => repos.lifeAreas.softDelete(id));
    await reload();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...areas];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    setAreas(next); // optimistic
    await commit(() => repos.lifeAreas.reorder(next.map((x) => x.id)));
    await reload();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-xl font-semibold text-fg">{t('areas.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('areas.subtitle')}</p>
        </div>
        {areas.length > 0 ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('areas.new')}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-fg-muted">{t('common.loading')}</p>
      ) : areas.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" />}
          title={t('areas.emptyTitle')}
          description={t('areas.emptyDescription')}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('areas.new')}
            </Button>
          }
        />
      ) : (
        <ul className="area-grid">
          {areas.map((area, index) => (
            <li key={area.id} className="area-card surface group">
              <span
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ backgroundColor: area.color ?? 'hsl(var(--muted))' }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{area.name}</span>
              <div className="flex items-center gap-0.5 text-fg-muted">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.moveUp')}
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.moveDown')}
                  disabled={index === areas.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.edit')}
                  onClick={() => openEdit(area)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.archive')}
                  onClick={() => void archive(area)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.delete')}
                  onClick={() => setConfirmDelete(area)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AreaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSubmit={submitForm}
      />

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent title={t('areas.confirmDeleteTitle')}>
          <p className="text-sm text-fg-muted">{t('areas.confirmDeleteBody')}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void doDelete()}>
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
