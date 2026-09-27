import { eq, like } from 'drizzle-orm';
import type { AppDatabase } from '../drivers/sqljs';
import { settings } from '../schema';
import { newId } from '@/shared/lib/id';

export interface KnowledgeNote {
  id: string;
  title: string;
  body: string;
  kind: 'note' | 'idea' | 'link';
  folder: string;
  goalId: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  category: string;
}
export interface PersonalSpace {
  name: string;
  intention: string;
  visions: Record<string, string>;
}
/** Versioned personal workspace records are included in SQLite and JSON backups. */
export class WorkspaceRepository {
  constructor(private readonly db: AppDatabase) {}
  async read<T>(key: string, fallback: T): Promise<T> {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, `workspace.v1.${key}`))
      .get();
    return row ? (JSON.parse(row.value) as T) : fallback;
  }
  async write<T>(key: string, value: T): Promise<void> {
    const updatedAt = Date.now(),
      encoded = JSON.stringify(value);
    this.db
      .insert(settings)
      .values({ key: `workspace.v1.${key}`, value: encoded, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: encoded, updatedAt } })
      .run();
  }
  private async list<T>(kind: string): Promise<T[]> {
    return this.db
      .select()
      .from(settings)
      .where(like(settings.key, `workspace.v1.${kind}.%`))
      .all()
      .map((row) => JSON.parse(row.value) as T);
  }
  notes() {
    return this.list<KnowledgeNote>('note').then((rows) =>
      rows.sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }
  events() {
    return this.list<CalendarEvent>('event').then((rows) =>
      rows.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)),
    );
  }
  async saveNote(input: Omit<KnowledgeNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (
      !input.title.trim() ||
      input.title.length > 200 ||
      !['note', 'idea', 'link'].includes(input.kind)
    )
      throw new Error('Invalid note');
    if (input.url && !['https:', 'http:'].includes(new URL(input.url).protocol))
      throw new Error('Invalid URL');
    const id = input.id || newId(),
      previous = await this.read<KnowledgeNote | null>(`note.${id}`, null);
    const note: KnowledgeNote = {
      ...input,
      id,
      title: input.title.trim(),
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await this.write(`note.${id}`, note);
    return note;
  }
  async saveEvent(input: Omit<CalendarEvent, 'id'> & { id?: string }) {
    const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (
      !input.title.trim() ||
      input.title.length > 200 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !validTime(input.start) ||
      !validTime(input.end) ||
      input.end <= input.start
    )
      throw new Error('Invalid event');
    const parsed = new Date(`${input.date}T12:00:00`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.getFullYear() !== Number(input.date.slice(0, 4)) ||
      parsed.getMonth() + 1 !== Number(input.date.slice(5, 7)) ||
      parsed.getDate() !== Number(input.date.slice(8, 10))
    )
      throw new Error('Invalid date');
    const event = { ...input, id: input.id || newId(), title: input.title.trim() };
    await this.write(`event.${event.id}`, event);
    return event;
  }
  async remove(kind: 'note' | 'event', id: string) {
    this.db
      .delete(settings)
      .where(eq(settings.key, `workspace.v1.${kind}.${id}`))
      .run();
  }
}
