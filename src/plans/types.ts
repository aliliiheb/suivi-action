export type Role = 'ADMIN' | 'CHEF' | 'PILOTE';
export type Status = 'À faire' | 'En cours' | 'Terminée' | 'Bloquée';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
};
export type Client = { id: string; version: number; code: string; name: string; contact: string };
export type Project = {
  id: string;
  version: number;
  code: string;
  name: string;
  client_id: string;
  manager_id: string;
  members: string[];
  description: string;
  planned_start: string;
  planned_end: string;
};
export type Module = {
  id: string;
  version: number;
  code: string;
  name: string;
  description: string;
  project_id: string;
};
export type Corrective = {
  id: string;
  description: string;
  responsible_id: string;
  deadline: string;
  status: Status;
};
export type Action = {
  id: string;
  version: number;
  code: string;
  description: string;
  objective: string;
  module_id: string;
  pilot_id: string;
  planned_start: string;
  planned_end: string;
  actual_start: string;
  actual_end: string;
  status: Status;
  progress: number;
  cause: string;
  target: number | null;
  achieved: number | null;
  unit: string;
  corrective: Corrective[];
};
export type State = {
  user: User;
  users: User[];
  clients: Client[];
  projects: Project[];
  modules: Module[];
  actions: Action[];
};
export type Kind = 'clients' | 'projects' | 'modules' | 'actions' | 'users';
export type Entity = Client | Project | Module | Action | User;
export type Audit = {
  id: string;
  author: string;
  at: string;
  operation: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};
export const statuses: Status[] = ['À faire', 'En cours', 'Terminée', 'Bloquée'];
export const roles: Record<Role, string> = {
  ADMIN: 'Administrateur',
  CHEF: 'Chef de projet',
  PILOTE: 'Pilote',
};
export const dateFR = (s: string) =>
  s ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(s)) : '—';
export const isLate = (a: Action) =>
  a.status !== 'Terminée' && a.planned_end < new Date().toISOString().slice(0, 10);
export const projectOf = (s: State, a: Action) =>
  s.projects.find((p) => p.id === s.modules.find((m) => m.id === a.module_id)?.project_id);
export const manages = (s: State, p?: Project) =>
  s.user.role === 'ADMIN' || (s.user.role === 'CHEF' && p?.manager_id === s.user.id);
export const average = (actions: Action[]) =>
  actions.length ? Math.round(actions.reduce((n, a) => n + a.progress, 0) / actions.length) : null;
