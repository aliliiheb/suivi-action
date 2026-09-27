import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Target, Plus, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { GoalWithArea } from '@/db/repositories/goals';
import type { LifeArea } from '@/db/repositories/lifeAreas';
import { Button } from '@/shared/ui/components/Button';
import { EmptyState } from '@/shared/ui/components/EmptyState';
import { ProgressBar } from '@/shared/ui/components/ProgressBar';
import { GoalFormDialog, type GoalFormValues } from './GoalFormDialog';
import { GoalDetailPage } from './GoalDetailPage';
import { GOAL_TYPES } from '@/domain/goals/goalTypes';
import { goalCover, goalIcon } from './goalPresentation';

export function GoalsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repos, commit, progress } = useDb();
  const [goals, setGoals] = useState<GoalWithArea[]>([]);
  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const reload = useCallback(async () => {
    const [g, a] = await Promise.all([repos.goals.list(), repos.lifeAreas.list()]);
    setGoals(g);
    setAreas(a);
    setLoading(false);
  }, [repos]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const createGoal = async (values: GoalFormValues) => {
    let createdId = '';
    await commit(async () => {
      const newId = await repos.goals.create(values);
      createdId = newId;
      await progress.recomputeGoal(newId);
    });
    await reload();
    setTypeFilter('all');
    setStatusFilter('all');
    setAreaFilter('all');
    navigate(`/goals/${createdId}`);
  };
  const visible = goals.filter(
    (g) =>
      (typeFilter === 'all' || g.goalType === typeFilter) &&
      (statusFilter === 'all' || g.status === statusFilter) &&
      (areaFilter === 'all' || g.areaId === areaFilter),
  );
  const selected = id ?? visible[0]?.id;
  return (
    <div className="objectives-page">
      <header className="objectives-heading">
        <div>
          <h1>{t('goalStudio.title')}</h1>
          <p>{t('goalStudio.subtitle')}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus size={17} />
          {t('goals.new')}
        </Button>
      </header>
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={32} />}
          title={t('goals.emptyTitle')}
          description={t('goals.emptyDescription')}
        />
      ) : (
        <div className={`objectives-layout ${selected ? 'has-selection' : ''}`}>
          <section className="objectives-library" aria-label={t('goalStudio.title')}>
            <div className="objective-status-filters" aria-label={t('goalStudio.status')}>
              {['all', 'active', 'paused', 'done'].map((status) => (
                <button
                  type="button"
                  key={status}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {t(`goalStudio.statuses.${status}`)}{' '}
                  <span>{goals.filter((g) => status === 'all' || g.status === status).length}</span>
                </button>
              ))}
            </div>
            <div className="objective-domain-filters" aria-label={t('goals.areaLabel')}>
              <button
                type="button"
                aria-pressed={areaFilter === 'all'}
                onClick={() => setAreaFilter('all')}
              >
                {t('goalStudio.allAreas')}
              </button>
              {areas
                .filter((a) => goals.some((g) => g.areaId === a.id))
                .map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    aria-pressed={areaFilter === a.id}
                    onClick={() => setAreaFilter(a.id)}
                  >
                    <span
                      className="objective-domain-dot"
                      style={{ background: a.color ?? undefined }}
                    />
                    {a.name}
                    <small>{goals.filter((g) => g.areaId === a.id).length}</small>
                  </button>
                ))}
            </div>
            <label className="objective-type-filter">
              {t('goalTypes.filter')}
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">{t('goalTypes.all')}</option>
                {GOAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`goalTypes.types.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <ul className="objective-gallery">
              {visible.map((g) => {
                const Icon = goalIcon(g.goalType);
                return (
                  <li key={g.id}>
                    <Link
                      to={`/goals/${g.id}`}
                      className="objective-tile"
                      aria-current={selected === g.id ? 'page' : undefined}
                    >
                      <div className="objective-cover">
                        <img src={goalCover(g.goalType)} alt="" loading="lazy" />
                        {['p1', 'p2'].includes(g.priority) && (
                          <span className="objective-priority">{g.priority.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="objective-tile-content">
                        <h2>{g.title}</h2>
                        <div className="objective-tile-meta">
                          <span>
                            <Icon size={13} />
                            {g.areaName ?? t(`goalTypes.types.${g.goalType}`)}
                          </span>
                          <strong>{Math.round(g.progress)}%</strong>
                        </div>
                        <ProgressBar value={g.progress} />
                        <div className="objective-tile-footer">
                          <span>
                            <CalendarDays size={12} />
                            {g.deadline ? format(g.deadline, 'dd/MM/yy') : t('goals.noDeadline')}
                          </span>
                          <span data-status={g.status}>
                            <CheckCircle2 size={12} />
                            {t(`goalStudio.statuses.${g.status}`)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {!visible.length && <p className="objective-no-match">{t('goalTypes.noMatch')}</p>}
            <button type="button" className="objective-add-tile" onClick={() => setFormOpen(true)}>
              <Plus size={23} />
              <strong>{t('goals.new')}</strong>
              <span>{t('goalStudio.newHint')}</span>
            </button>
          </section>
          {selected && <GoalDetailPage key={selected} goalId={selected} onChanged={reload} />}
        </div>
      )}
      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        areas={areas}
        initial={null}
        onSubmit={createGoal}
      />
    </div>
  );
}
