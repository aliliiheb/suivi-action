import { useWords } from '@/features/workspaces/useWords';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Calendar, Plus, Clock } from 'lucide-react';
import { useDb } from '@/app/providers/databaseContext';
import type { CalendarEvent } from '@/db/repositories/workspace';
import type { TaskWithContext } from '@/db/repositories/tasks';
import { dayKey } from '@/shared/lib/time';
import { Dialog, DialogContent } from '@/shared/ui/components/Dialog';
import { Button } from '@/shared/ui/components/Button';
import { ScenicPath } from '@/features/journey/ScenicPath';
import { StudioPanel } from '@/features/workspaces/Studio';
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export function PlannerBoard({
  days,
  date,
  tasks,
  onDate,
  view,
}: {
  days: Date[];
  date: string;
  tasks: TaskWithContext[];
  onDate: (date: string) => void;
  view: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 5 * 42;
  }, [view]);
  const w = useWords(),
    { repos, commit } = useDb();
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [draft, setDraft] = useState<CalendarEvent | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [removing, setRemoving] = useState(false),
    [filter, setFilter] = useState('all');
  const reload = useCallback(async () => setEvents(await repos.workspace.events()), [repos]);
  useEffect(() => {
    void reload().catch(() => setError(true));
  }, [reload]);
  const categories = [
    ['work', w('Travail', 'Work', 'عمل')],
    ['learning', w('Apprentissage', 'Learning', 'تعلم')],
    ['personal', w('Personnel', 'Personal', 'شخصي')],
    ['appointment', w('Rendez-vous', 'Appointment', 'موعد')],
  ];
  const visible = events.filter((e) => filter === 'all' || e.category === filter),
    dayEvents = visible.filter((e) => e.date === date),
    rangeEvents = visible.filter((e) => days.some((d) => dayKey(d) === e.date));
  const total = rangeEvents.reduce((s, e) => s + minutes(e.end) - minutes(e.start), 0);
  const create = (d = date, hour = 9) => {
    setDraft({
      id: '',
      title: '',
      date: d,
      start: `${String(hour).padStart(2, '0')}:00`,
      end: `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`,
      category: 'work',
    });
    setRemoving(false);
  };
  const save = async (remove = false) => {
    if (!draft) return;
    setBusy(true);
    setError(false);
    try {
      await commit(async () => {
        if (remove) await repos.workspace.remove('event', draft.id);
        else await repos.workspace.saveEvent(draft);
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
  const overlaps = draft
    ? events.some(
        (e) =>
          e.id !== draft.id && e.date === draft.date && e.start < draft.end && e.end > draft.start,
      )
    : false;
  return (
    <>
      <div className="atelier-toolbar">
        <div className="atelier-tabs">
          {[['all', w('Tout', 'All', 'الكل')], ...categories].map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id!)}>
              {label}
            </button>
          ))}
        </div>
        <Button onClick={() => create()}>
          <Plus size={16} />
          {w('Ajouter un créneau', 'Add time slot', 'إضافة فترة')}
        </Button>
      </div>
      <div className="planner-composition">
        <div className="atelier-stack">
          <ScenicPath
            stops={dayEvents
              .slice(0, 8)
              .map((e) => ({ id: e.id, title: e.title, meta: e.start, icon: Calendar }))}
            onSelect={(id) => {
              setDraft(events.find((e) => e.id === id)!);
              setRemoving(false);
            }}
            empty={w(
              'Donne une place dans ton temps à ce qui compte vraiment.',
              'Give your time to what truly matters.',
              'امنح وقتك لما يهم حقاً.',
            )}
          />
          {(view === 'week' || view === 'day') && (
            <div className="planner-grid-scroll" ref={gridRef}>
              <div
                className="planner-time-grid"
                style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(115px, 1fr))` }}
              >
                <div className="planner-hours">
                  <div className="planner-day-head" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h}>{String(h).padStart(2, '0')}:00</span>
                  ))}
                </div>
                {days.map((d) => {
                  const key = dayKey(d),
                    items = visible.filter((e) => e.date === key),
                    allDay = tasks.filter(
                      (t) => t.plannedDate !== null && dayKey(t.plannedDate) === key,
                    );
                  return (
                    <div className="planner-day" key={key}>
                      <button
                        className="planner-day-head"
                        aria-pressed={key === date}
                        onClick={() => onDate(key)}
                      >
                        {d.toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                        <small>
                          {allDay.length}{' '}
                          {w('tâches sans heure', 'untimed tasks', 'مهام دون توقيت')}
                        </small>
                      </button>
                      <div className="planner-day-track">
                        {Array.from({ length: 24 }, (_, h) => (
                          <button
                            key={h}
                            className="planner-empty-slot"
                            aria-label={`${w('Ajouter', 'Add', 'إضافة')} ${key} ${h}:00`}
                            onClick={() => create(key, h === 23 ? 22 : h)}
                          />
                        ))}
                        {items.map((e) => {
                          const ordered = [...items].sort((a, b) => a.start.localeCompare(b.start));
                          let group: CalendarEvent[] = [],
                            groupEnd = '';
                          for (const candidate of ordered) {
                            if (group.length && candidate.start >= groupEnd) {
                              if (group.some((x) => x.id === e.id)) break;
                              group = [];
                              groupEnd = '';
                            }
                            group.push(candidate);
                            if (candidate.end > groupEnd) groupEnd = candidate.end;
                          }
                          const concurrent = group,
                            lane = group.findIndex((x) => x.id === e.id);
                          return (
                            <button
                              className={`planner-event planner-${e.category}`}
                              key={e.id}
                              style={{
                                top: (minutes(e.start) / 60) * 42,
                                height: Math.max(
                                  23,
                                  ((minutes(e.end) - minutes(e.start)) / 60) * 42,
                                ),
                                left: `${(lane / concurrent.length) * 100}%`,
                                width: `${100 / concurrent.length}%`,
                              }}
                              onClick={() => {
                                setDraft(e);
                                setRemoving(false);
                              }}
                            >
                              <b>
                                {e.start}–{e.end}
                              </b>
                              <span>{e.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <aside className="atelier-stack">
          <StudioPanel title={w('Aperçu de la période', 'Period overview', 'نظرة على الفترة')}>
            <div className="planner-total">
              <Clock size={34} />
              <strong>
                {Math.floor(total / 60)}h {total % 60}m
              </strong>
              <small>
                {w('dans les créneaux affichés', 'in displayed time slots', 'في الفترات المعروضة')}
              </small>
            </div>
            <div className="atelier-row">
              {w('Créneaux', 'Time slots', 'فترات')}
              <b>{rangeEvents.length}</b>
            </div>
            <div className="atelier-row">
              {w('Tâches', 'Tasks', 'مهام')}
              <b>{tasks.length}</b>
            </div>
          </StudioPanel>
          <StudioPanel title={w('Créneaux du jour', 'Time slots today', 'فترات اليوم')}>
            {dayEvents.map((e) => (
              <button
                className="atelier-row"
                key={e.id}
                onClick={() => {
                  setDraft(e);
                  setRemoving(false);
                }}
              >
                <span>
                  {e.title}
                  <small>
                    {e.start}–{e.end}
                  </small>
                </span>
              </button>
            ))}
            {!dayEvents.length && (
              <p>
                {w(
                  'Aucun créneau à cette date.',
                  'No time slots on this date.',
                  'لا فترات في هذا التاريخ.',
                )}
              </p>
            )}
          </StudioPanel>
          <StudioPanel
            title={w('Échéances de la période', 'Deadlines in this period', 'مواعيد الفترة')}
          >
            {tasks
              .filter((t) => t.deadline !== null && !t.completed)
              .slice(0, 6)
              .map((t) => (
                <button
                  className="atelier-row"
                  key={t.id}
                  onClick={() => onDate(dayKey(t.deadline!))}
                >
                  <span>
                    {t.title}
                    <small>{new Date(t.deadline!).toLocaleDateString()}</small>
                  </span>
                </button>
              ))}
          </StudioPanel>
        </aside>
      </div>
      {error && (
        <p role="alert">
          {w(
            'Impossible de charger ou enregistrer.',
            'Unable to load or save.',
            'تعذر التحميل أو الحفظ.',
          )}
        </p>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(o) => {
          if (!o && !busy) setDraft(null);
        }}
      >
        <DialogContent title={w('Mon créneau', 'My time slot', 'فترتي')}>
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
                {w('Date', 'Date', 'التاريخ')}
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <div className="atelier-two">
                <label>
                  {w('Début', 'Start', 'البداية')}
                  <input
                    type="time"
                    required
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </label>
                <label>
                  {w('Fin', 'End', 'النهاية')}
                  <input
                    type="time"
                    required
                    min={draft.start}
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                </label>
              </div>
              <label>
                {w('Catégorie', 'Category', 'الفئة')}
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {categories.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {overlaps && (
                <p>
                  {w(
                    'Ce créneau chevauche un autre rendez-vous.',
                    'This time slot overlaps another appointment.',
                    'تتداخل هذه الفترة مع موعد آخر.',
                  )}
                </p>
              )}
              {error && (
                <p role="alert">
                  {w(
                    'Vérifiez la date et les heures : la fin doit suivre le début.',
                    'Check the date and times: end must follow start.',
                    'تحقق من التاريخ والوقت: النهاية بعد البداية.',
                  )}
                </p>
              )}
              <div className="atelier-actions">
                <Button type="submit" disabled={busy || draft.end <= draft.start}>
                  {w('Enregistrer', 'Save', 'حفظ')}
                </Button>
                {draft.id && (
                  <Button type="button" variant="outline" onClick={() => setRemoving(true)}>
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
    </>
  );
}
