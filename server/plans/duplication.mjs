import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { fail, parse } from './rules.mjs';
import { snapshot, authorize, mutate, audit, projectFor } from './service.mjs';
import { copyDocuments } from './documents.mjs';

export const resetExecution = (data) => ({
  ...data,
  status: 'À faire',
  progress: 0,
  actual_start: '',
  actual_end: '',
  achieved: null,
  cause: '',
  corrective: [],
});
const clean = ({ id: _id, version: _version, ...data }) => data;
const canonical = (value) =>
  JSON.stringify(
    value && typeof value === 'object'
      ? Array.isArray(value)
        ? value.map((v) => JSON.parse(canonical(v)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, JSON.parse(canonical(value[k]))]),
          )
      : value,
  );
async function record(tx, user, kind, source, target, requestId, hash) {
  await tx.query(
    'INSERT INTO plan_duplications(id,kind,source_id,target_id,actor_id,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(), kind, source.id, target.id, user.id, requestId, hash],
  );
  const state = await snapshot(tx, user);
  await audit(tx, user, target.id, projectFor(state, kind, target)?.id, 'Duplication', null, {
    source_id: source.id,
    target_id: target.id,
  });
}
export async function duplicate(tx, user, kind, sourceId, input) {
  if (!['projects', 'modules', 'actions', 'missions'].includes(kind))
    fail(404, 'Type de fiche non duplicable.');
  const body = parse(
    z
      .object({
        request_id: z.string().uuid(),
        version: z.number().int(),
        data: z.record(z.string(), z.unknown()),
        copy_documents: z.boolean().default(false),
        copy_actions: z.boolean().default(false),
      })
      .strict(),
    input,
  );
  const state = await snapshot(tx, user);
  const source = state[kind].find((r) => r.id === sourceId);
  if (!source) fail(404, 'Fiche source inaccessible.');
  authorize(state, kind, source, 'create');
  if ((body.copy_documents && kind !== 'projects') || (body.copy_actions && kind !== 'modules'))
    fail(422, 'Option de duplication incompatible.');
  const hash = createHash('sha256')
    .update(canonical({ kind, sourceId, ...body }))
    .digest('hex');
  const previous = (
    await tx.query('SELECT * FROM plan_duplications WHERE actor_id=$1 AND request_id=$2', [
      user.id,
      body.request_id,
    ])
  ).rows[0];
  if (previous) {
    if (previous.request_hash !== hash)
      fail(409, 'Cette demande a déjà été enregistrée avec un autre contenu.');
    const existing = state[kind].find((r) => r.id === previous.target_id);
    if (!existing)
      fail(409, 'La copie existe déjà mais elle a été supprimée ou n’est plus accessible.');
    return existing;
  }
  if (source.version !== body.version)
    fail(409, 'La fiche source a changé. Rouvrez le formulaire de duplication.');
  let data = { ...body.data };
  if (kind === 'actions') data = resetExecution(data);
  if (kind === 'missions')
    data = {
      ...data,
      status: 'Planifiée',
      actual_start: '',
      actual_end: '',
      observations: '',
      archived: false,
    };
  const target = await mutate(tx, user, kind, null, data, null, 'create');
  if (kind === 'projects' && body.copy_documents)
    await copyDocuments(tx, user, sourceId, target.id);
  if (kind === 'modules' && body.copy_actions) {
    const destination = state.projects.find((p) => p.id === target.project_id);
    for (const action of state.actions.filter((a) => a.module_id === sourceId)) {
      const actionData = resetExecution({ ...clean(action), module_id: target.id, mission_id: '' });
      if (
        !state.users.some((u) => u.id === actionData.pilot_id && u.active) ||
        !destination.members.includes(actionData.pilot_id)
      )
        actionData.pilot_id = destination.manager_id;
      const copy = await mutate(tx, user, 'actions', null, actionData, null, 'create');
      await record(tx, user, 'actions', action, copy, randomUUID(), hash);
    }
  }
  await record(tx, user, kind, source, target, body.request_id, hash);
  return target;
}
