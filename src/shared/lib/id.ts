import { ulid } from 'ulid';

/** Generate a new sortable, collision-resistant id (spec §51). */
export function newId(): string {
  return ulid();
}
