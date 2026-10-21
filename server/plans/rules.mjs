import { z } from 'zod';
import locations from './location-options.json' with { type: 'json' };
export const statuses = ['À faire', 'En cours', 'Terminée', 'Bloquée'];
const text = z.string().trim().min(1, 'Champ obligatoire').max(2000);
const short = z.string().trim().min(1, 'Champ obligatoire').max(120);
const optionalText = z.string().max(10000).default('');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ')
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Date invalide',
  );
const optionalDate = z.union([date, z.literal('')]).default('');
const numeric = z.number().finite().nullable().default(null);
const missionId = z.string().max(120).default('');
export const missionStatuses = ['Planifiée', 'En cours', 'Suspendue', 'Terminée', 'Annulée'];
export const missionPriorities = ['Basse', 'Normale', 'Haute', 'Urgente'];
export const actionSchema = z
  .object({
    code: short,
    description: text,
    objective: optionalText,
    location: z
      .string()
      .refine((v) => !v || locations.includes(v), 'Sélectionnez un emplacement proposé.')
      .default(''),
    location_other: z.string().trim().max(200).default(''),
    mission_number: z.string().trim().max(120).default(''),
    mission_id: missionId,
    priority_reference: z.string().trim().max(120).default(''),
    pilot_id: short,
    module_id: short,
    planned_start: date,
    planned_end: date,
    deadline_2: optionalDate,
    deadline_3: optionalDate,
    actual_start: optionalDate,
    actual_end: optionalDate,
    status: z.enum(statuses),
    progress: z.number().min(0).max(100),
    cause: optionalText,
    target: numeric,
    achieved: numeric,
    unit: z.string().max(80).default(''),
    corrective: z
      .array(
        z.object({
          id: short,
          description: text,
          responsible_id: short,
          deadline: date,
          status: z.enum(statuses),
        }),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.location === 'AUTRE (à préciser)' && !v.location_other)
      issue('location_other', 'Précisez votre emplacement.');
    if (v.location !== 'AUTRE (à préciser)' && v.location_other)
      issue('location_other', 'L’emplacement personnalisé nécessite le choix AUTRE (à préciser).');
    if (v.planned_end < v.planned_start)
      issue('planned_end', 'La fin prévue précède le début prévu.');
    if (v.deadline_2 && v.deadline_2 < v.planned_end)
      issue('deadline_2', 'La 2e échéance doit être égale ou postérieure à la première.');
    if (v.deadline_3 && (!v.deadline_2 || v.deadline_3 < v.deadline_2))
      issue('deadline_3', 'La 3e échéance nécessite une 2e échéance antérieure ou égale.');
    if (v.actual_end && (!v.actual_start || v.actual_end < v.actual_start))
      issue('actual_end', 'La fin réelle nécessite un début réel antérieur ou égal.');
    if (v.status === 'Terminée' && (v.progress !== 100 || !v.actual_end))
      issue('status', 'Une action terminée exige 100 % et une date de fin réelle.');
    if (v.status !== 'Terminée' && v.actual_end)
      issue('actual_end', 'Une fin réelle exige le statut Terminée.');
    if (v.target === null && (v.achieved !== null || v.unit))
      issue(
        'target',
        'Une mesure nécessite une cible. Pour un objectif qualitatif, laissez les mesures vides.',
      );
    if (v.target !== null && !v.unit.trim())
      issue('unit', 'Précisez une unité pour un objectif mesurable.');
  });
export const schemas = {
  missions: z
    .object({
      number: short.transform((v) => v.toUpperCase()),
      title: text,
      description: optionalText,
      client_id: short,
      project_id: missionId,
      manager_id: short,
      members: z.array(short).max(500),
      location: z
        .string()
        .refine((v) => !v || locations.includes(v), 'Emplacement invalide.')
        .default(''),
      location_other: z.string().trim().max(200).default(''),
      planned_start: date,
      planned_end: date,
      actual_start: optionalDate,
      actual_end: optionalDate,
      status: z.enum(missionStatuses),
      priority: z.enum(missionPriorities),
      observations: optionalText,
      archived: z.boolean().default(false),
    })
    .strict()
    .superRefine((v, ctx) => {
      const issue = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });
      if (v.planned_end < v.planned_start) issue('planned_end', 'La fin prévue précède le début.');
      if (v.actual_end && (!v.actual_start || v.actual_end < v.actual_start))
        issue('actual_end', 'Renseignez un début réel antérieur ou égal.');
      if (v.status === 'Terminée' && !v.actual_end)
        issue('actual_end', 'Une mission terminée nécessite les dates réelles.');
      if (v.actual_end && v.status !== 'Terminée')
        issue('status', 'Une fin réelle nécessite le statut Terminée.');
      if (v.location === 'AUTRE (à préciser)' && !v.location_other)
        issue('location_other', 'Précisez l’emplacement.');
      if (v.location !== 'AUTRE (à préciser)' && v.location_other)
        issue('location_other', 'Choisissez AUTRE pour un emplacement personnalisé.');
    }),
  clients: z.object({ code: short, name: short, contact: optionalText }).strict(),
  projects: z
    .object({
      code: short,
      name: short,
      client_id: short,
      manager_id: short,
      description: optionalText,
      planned_start: date,
      planned_end: date,
      members: z.array(short).max(500),
      mission_id: missionId,
    })
    .strict()
    .refine((v) => v.planned_end >= v.planned_start, {
      message: 'La fin précède le début.',
      path: ['planned_end'],
    }),
  modules: z
    .object({
      code: short,
      name: short,
      description: optionalText,
      project_id: short,
      parent_module_id: z.string().max(120).default(''),
      mission_id: missionId,
    })
    .strict(),
  actions: actionSchema,
  users: z
    .object({
      name: short,
      email: z
        .string()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      role: z.enum(['ADMIN', 'CHEF', 'PILOTE']),
      active: z.boolean(),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Mot de passe limité à 72 octets UTF-8.')
        .optional(),
    })
    .strict(),
};
export function fail(status, message, details) {
  throw Object.assign(new Error(message), { status, details });
}
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success)
    fail(
      422,
      'Vérifiez les champs du formulaire.',
      r.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`),
    );
  return r.data;
}
export const late = (action, today = new Date().toISOString().slice(0, 10)) =>
  action.status !== 'Terminée' && action.planned_end < today;
export const progress = (actions) =>
  actions.length
    ? Math.round(actions.reduce((sum, a) => sum + a.progress, 0) / actions.length)
    : null;
export const variance = (action) =>
  action.target === null || action.achieved === null ? null : action.achieved - action.target;
export const duration = (project) =>
  Math.round((Date.parse(project.planned_end) - Date.parse(project.planned_start)) / 86400000) + 1;
export const canManage = (user, project) =>
  user.role === 'ADMIN' || (user.role === 'CHEF' && project.manager_id === user.id);
