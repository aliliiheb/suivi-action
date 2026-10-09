import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { schemas, parse, fail, canManage } from './rules.mjs';
export const tables = ['clients', 'projects', 'modules', 'actions', 'users'];
export const unpack = (row) => row && { ...row.data, id: row.id, version: row.version };
export async function userById(tx, id) {
  return (
    await tx.query('SELECT id,name,email,role,active,version FROM plan_users WHERE id=$1', [id])
  ).rows[0];
}
export async function exclusive(db, actorId, fn) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT id FROM plan_write_lock WHERE id=1 FOR UPDATE');
    const actor = await userById(tx, actorId);
    if (!actor?.active) fail(401, 'Session expirée.');
    return fn(tx, actor);
  });
}
export async function snapshot(tx, user) {
  const projects = (
    await tx.query(
      `SELECT p.* FROM plan_projects p WHERE $1='ADMIN' OR p.manager_id=$2 OR EXISTS(SELECT 1 FROM plan_members m WHERE m.project_id=p.id AND m.user_id=$2)`,
      [user.role, user.id],
    )
  ).rows.map(unpack);
  const ids = projects.map((p) => p.id);
  const modules = (
    await tx.query('SELECT * FROM plan_modules WHERE project_id=ANY($1::text[])', [ids])
  ).rows.map(unpack);
  const actions = (
    await tx.query('SELECT * FROM plan_actions WHERE module_id=ANY($1::text[])', [
      modules.map((m) => m.id),
    ])
  ).rows.map(unpack);
  const clients = (
    await tx.query(`SELECT * FROM plan_clients WHERE $1='ADMIN' OR id=ANY($2::text[])`, [
      user.role,
      projects.map((p) => p.client_id),
    ])
  ).rows.map(unpack);
  // Managers need the directory to grant membership; pilots only see colleagues in their projects.
  const users = (
    await tx.query(
      `SELECT id,name,email,role,active,version FROM plan_users WHERE $1 IN ('ADMIN','CHEF') OR id=$2 OR id IN (SELECT user_id FROM plan_members WHERE project_id=ANY($3::text[])) OR id IN (SELECT manager_id FROM plan_projects WHERE id=ANY($3::text[]))`,
      [user.role, user.id, ids],
    )
  ).rows;
  return { user, clients, projects, modules, actions, users };
}
export async function audit(tx, actor, entityId, projectId, operation, before, after) {
  await tx.query(
    'INSERT INTO plan_audit(id,entity_id,project_id,actor_id,operation,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      randomUUID(),
      entityId,
      projectId,
      actor.id,
      operation,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}
export function projectFor(state, kind, value) {
  if (kind === 'projects') return value;
  if (kind === 'modules') return state.projects.find((p) => p.id === value.project_id);
  if (kind === 'actions') {
    const mod = state.modules.find((m) => m.id === value.module_id);
    return state.projects.find((p) => p.id === mod?.project_id);
  }
}
export function authorize(state, kind, value, operation) {
  const user = state.user;
  if (kind === 'users' || kind === 'clients') {
    if (user.role !== 'ADMIN') fail(403, 'Cette opération est réservée à un administrateur.');
    return;
  }
  const project = projectFor(state, kind, value);
  if (!project) fail(403, 'Projet inaccessible.');
  if (canManage(user, project)) return;
  if (
    kind === 'actions' &&
    operation === 'update' &&
    value.pilot_id === user.id &&
    user.role === 'PILOTE'
  )
    return;
  fail(403, 'Vous ne pouvez pas modifier cet élément.');
}
function validateMembers(state, value) {
  for (const id of [
    value.pilot_id,
    ...(value.corrective || []).map((c) => c.responsible_id),
  ].filter(Boolean)) {
    const project = projectFor(state, 'actions', value);
    if (
      !state.users.find((u) => u.id === id && u.active) ||
      !(project?.members.includes(id) || project?.manager_id === id)
    )
      fail(422, 'Le pilote et les responsables doivent être des membres actifs du projet.');
  }
}
export async function mutate(tx, user, kind, id, input, version, operation = 'update') {
  if (!tables.includes(kind)) fail(404, 'Ressource inconnue.');
  const state = await snapshot(tx, user);
  const before = id ? state[kind].find((r) => r.id === id) : null;
  if (id && !before) fail(404, 'Élément inaccessible ou supprimé.');
  if (before && (!Number.isInteger(version) || before.version !== version))
    fail(409, 'Cet élément a changé. Rechargez-le avant de réappliquer vos modifications.', {
      current: before,
    });
  // Older open clients must not clear fields introduced after their page was loaded.
  const addedKeys =
    kind === 'actions'
      ? [
          'deadline_2',
          'deadline_3',
          'location',
          'location_other',
          'mission_number',
          'priority_reference',
        ]
      : kind === 'modules'
        ? ['parent_module_id']
        : [];
  const preserved = Object.fromEntries(
    addedKeys.filter((key) => before && before[key] !== undefined).map((key) => [key, before[key]]),
  );
  const data = operation === 'delete' ? before : parse(schemas[kind], { ...preserved, ...input });
  if (before) authorize(state, kind, before, operation);
  else authorize(state, kind, data, 'create');
  if (kind === 'projects' && user.role === 'CHEF' && data.manager_id !== user.id)
    fail(403, 'Seul un administrateur peut transférer la responsabilité du projet.');
  if (operation !== 'delete') {
    if (kind === 'projects') {
      if (!state.clients.some((c) => c.id === data.client_id)) fail(422, 'Client inaccessible.');
      if (
        !state.users.some(
          (u) => u.id === data.manager_id && u.active && ['ADMIN', 'CHEF'].includes(u.role),
        )
      )
        fail(422, 'Chef de projet invalide.');
      data.members = [...new Set([...data.members, data.manager_id])];
      if (data.members.some((id) => !state.users.some((u) => u.id === id && u.active)))
        fail(422, 'Membre inconnu ou désactivé.');
      const assigned = state.actions
        .filter((a) => projectFor(state, 'actions', a)?.id === id)
        .flatMap((a) => [a.pilot_id, ...a.corrective.map((c) => c.responsible_id)]);
      if (assigned.some((id) => !data.members.includes(id)))
        fail(422, 'Réattribuez les actions avant de retirer un membre.');
    }
    if (kind === 'modules') {
      if (before && data.project_id !== before.project_id)
        fail(422, 'Le déplacement de modules entre projets n’est pas permis.');
      authorize(state, kind, data, 'create');
      const visited = new Set(id ? [id] : []);
      let parentId = data.parent_module_id;
      while (parentId) {
        if (visited.has(parentId))
          fail(
            422,
            'Un module ne peut pas être son propre parent ni créer une relation circulaire.',
          );
        visited.add(parentId);
        const parent = state.modules.find((m) => m.id === parentId);
        if (!parent || parent.project_id !== data.project_id)
          fail(422, 'Le module principal doit appartenir au même projet et être accessible.');
        parentId = parent.parent_module_id;
      }
    }
    if (kind === 'actions') {
      if (before && data.module_id !== before.module_id)
        fail(422, 'Le déplacement d’actions entre modules n’est pas permis.');
      if (user.role === 'PILOTE' && before) {
        const editable = [
          'status',
          'progress',
          'actual_start',
          'actual_end',
          'achieved',
          'cause',
          'corrective',
        ];
        for (const key of Object.keys(data))
          if (!editable.includes(key) && JSON.stringify(data[key]) !== JSON.stringify(before[key]))
            fail(403, 'Le pilote peut modifier uniquement le suivi de ses actions.');
      }
      validateMembers(state, data);
    }
  }
  const entityId = id || randomUUID();
  if (kind === 'users') {
    if (operation === 'delete') fail(422, 'Désactivez le compte pour conserver son historique.');
    if (!before && !data.password)
      fail(422, 'Un mot de passe d’au moins 12 caractères est obligatoire.');
    if (before?.id === user.id && (!data.active || data.role !== 'ADMIN'))
      fail(422, 'Vous ne pouvez pas retirer votre propre accès administrateur.');
    if (before?.role === 'ADMIN' && (!data.active || data.role !== 'ADMIN')) {
      const admins = (
        await tx.query("SELECT id FROM plan_users WHERE role='ADMIN' AND active=true")
      ).rows;
      if (admins.length <= 1) fail(422, 'Conservez au moins un administrateur actif.');
    }
    if (before && (!data.active || data.role === 'PILOTE')) {
      if (state.projects.some((p) => p.manager_id === id))
        fail(
          422,
          'Transférez les projets de ce responsable avant de changer son rôle ou de le désactiver.',
        );
    }
    if (
      before &&
      !data.active &&
      state.actions.some(
        (a) => a.pilot_id === id || a.corrective.some((c) => c.responsible_id === id),
      )
    )
      fail(422, 'Réattribuez les actions et les corrections avant de désactiver ce compte.');
    const hash = data.password ? await bcrypt.hash(data.password, 12) : null;
    if (before)
      await tx.query(
        'UPDATE plan_users SET name=$1,email=$2,role=$3,active=$4,password_hash=COALESCE($5,password_hash),version=version+1 WHERE id=$6',
        [data.name, data.email, data.role, data.active, hash, id],
      );
    else
      await tx.query(
        'INSERT INTO plan_users(id,name,email,role,active,password_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [entityId, data.name, data.email, data.role, data.active, hash],
      );
    if (before)
      await tx.query("DELETE FROM plan_sessions WHERE data->'passport'->>'user'=$1", [id]);
    const after = await userById(tx, entityId);
    await audit(
      tx,
      user,
      entityId,
      null,
      before ? 'Modification utilisateur' : 'Création utilisateur',
      before,
      { ...after, password_changed: Boolean(hash) },
    );
    return after;
  }
  if (operation === 'delete') {
    if (kind === 'modules' && state.modules.some((m) => m.parent_module_id === id))
      fail(422, 'Détachez les sous-modules avant de supprimer leur module principal.');
    await tx.query(`DELETE FROM plan_${kind} WHERE id=$1`, [id]);
    await audit(
      tx,
      user,
      id,
      projectFor(state, kind, before)?.id || null,
      'Suppression',
      before,
      null,
    );
    return { id };
  }
  const foreign =
    kind === 'projects'
      ? ['client_id', 'manager_id']
      : kind === 'modules'
        ? ['project_id']
        : kind === 'actions'
          ? ['module_id', 'pilot_id']
          : [];
  if (before)
    await tx.query(
      `UPDATE plan_${kind} SET data=$1,version=version+1${foreign.map((k, i) => `,${k}=$${i + 3}`).join('')} WHERE id=$2`,
      [JSON.stringify(data), id, ...foreign.map((k) => data[k])],
    );
  else
    await tx.query(
      `INSERT INTO plan_${kind}(id,data${foreign.map((k) => `,${k}`).join('')}) VALUES($1,$2${foreign.map((_, i) => `,$${i + 3}`).join('')})`,
      [entityId, JSON.stringify(data), ...foreign.map((k) => data[k])],
    );
  if (kind === 'projects') {
    await tx.query('DELETE FROM plan_members WHERE project_id=$1', [entityId]);
    for (const member of data.members)
      await tx.query('INSERT INTO plan_members(project_id,user_id) VALUES($1,$2)', [
        entityId,
        member,
      ]);
  }
  const after = { ...data, id: entityId, version: (before?.version || 0) + 1 };
  await audit(
    tx,
    user,
    entityId,
    kind === 'projects' ? entityId : projectFor(state, kind, data)?.id || null,
    before ? 'Modification' : 'Création',
    before,
    after,
  );
  return after;
}
