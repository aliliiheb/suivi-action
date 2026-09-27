import { randomUUID } from 'node:crypto';
import { actionSchema, fail, parse } from './rules.mjs';
import { snapshot, projectFor, authorize, mutate } from './service.mjs';
import { columns } from './files.mjs';
import { normalizeDate, normalizeNumber, resolveReference } from './import-normalization.mjs';
export async function previewImport(
  tx,
  user,
  { projectId, filename, headers, rows, mapping, matches = {} },
) {
  if (
    !Array.isArray(rows) ||
    rows.length > 1000 ||
    !Array.isArray(headers) ||
    headers.length > 80 ||
    !mapping ||
    typeof filename !== 'string' ||
    filename.length > 255
  )
    fail(422, 'Import invalide.');
  const state = await snapshot(tx, user);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) fail(403, 'Projet inaccessible.');
  const entries = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const entry = {
      line: i + 2,
      state: 'create',
      errors: [],
      data: null,
      current: null,
      expectedVersion: null,
    };
    try {
      const source = Object.fromEntries(
        Object.keys(columns)
          .filter((k) => mapping[k] && headers.includes(mapping[k]))
          .map((k) => [k, String(rows[i][headers.indexOf(mapping[k])] ?? '').trim()]),
      );
      source.module_id &&= resolveReference(
        source.module_id,
        state.modules.filter((m) => m.project_id === projectId),
        ['code', 'name'],
        'Module',
      );
      source.pilot_id &&= resolveReference(
        source.pilot_id,
        state.users.filter((u) => u.active && project.members.includes(u.id)),
        ['email', 'name'],
        'Responsable',
      );
      let current;
      if (source.id) {
        current = state.actions.find((a) => a.id === source.id);
        if (!current || projectFor(state, 'actions', current)?.id !== projectId)
          fail(422, 'Identifiant inconnu ou hors du projet.');
      } else if (matches[i]) {
        current = state.actions.find((a) => a.id === matches[i]);
        if (!current || projectFor(state, 'actions', current)?.id !== projectId)
          fail(422, 'Correspondance inaccessible.');
      } else {
        const candidates = state.actions.filter(
          (a) =>
            a.code === source.code &&
            projectFor(state, 'actions', a)?.id === projectId &&
            (!source.module_id || a.module_id === source.module_id),
        );
        if (candidates.length > 1) {
          entry.candidates = candidates.map((a) => ({
            id: a.id,
            code: a.code,
            module_id: a.module_id,
          }));
          fail(422, 'Plusieurs correspondances possibles : sélectionnez explicitement une action.');
        }
        current = candidates[0];
      }
      const version = source.version;
      delete source.version;
      delete source.id;
      const merged = {
        ...(current
          ? Object.fromEntries(
              Object.keys(columns)
                .filter((k) => !['id', 'version'].includes(k))
                .map((k) => [k, current[k]]),
            )
          : {}),
        ...source,
      };
      for (const key of ['progress', 'target', 'achieved']) {
        const v = merged[key];
        merged[key] =
          v === '' || v === undefined || v === null
            ? key === 'progress'
              ? 0
              : null
            : normalizeNumber(v);
      }
      for (const key of ['planned_start', 'planned_end', 'actual_start', 'actual_end'])
        if (key in merged) merged[key] = normalizeDate(merged[key]);
      if (typeof merged.corrective === 'string') {
        try {
          merged.corrective = JSON.parse(merged.corrective || '[]');
        } catch {
          fail(422, 'Actions correctives : JSON invalide.');
        }
      }
      const data = parse(actionSchema, merged);
      if (projectFor(state, 'actions', data)?.id !== projectId)
        fail(422, 'Module absent ou hors du projet.');
      authorize(state, 'actions', current || data, current ? 'update' : 'create');
      if (current && current.module_id !== data.module_id)
        fail(422, 'Le module d’une action existante ne peut pas être modifié.');
      if (user.role === 'PILOTE' && current)
        for (const k of Object.keys(data))
          if (
            ![
              'status',
              'progress',
              'actual_start',
              'actual_end',
              'achieved',
              'cause',
              'corrective',
            ].includes(k) &&
            JSON.stringify(data[k]) !== JSON.stringify(current[k])
          )
            fail(403, 'Modification non autorisée pour un pilote.');
      for (const responsible of [data.pilot_id, ...data.corrective.map((c) => c.responsible_id)])
        if (
          !project.members.includes(responsible) ||
          !state.users.some((u) => u.id === responsible && u.active)
        )
          fail(422, 'Responsable absent des membres actifs du projet.');
      const identity = current?.id || `${data.module_id}/${data.code}`;
      if (seen.has(identity)) fail(422, 'Doublon dans le fichier.');
      seen.add(identity);
      Object.assign(entry, {
        data,
        current,
        expectedVersion: current?.version ?? null,
        state: current
          ? !version
            ? 'confirm'
            : Number(version) !== current.version
              ? 'conflict'
              : 'update'
          : 'create',
      });
    } catch (error) {
      entry.state = 'error';
      entry.errors = [error.message, ...(Array.isArray(error.details) ? error.details : [])];
    }
    entries.push(entry);
  }
  const id = randomUUID();
  await tx.query(
    'INSERT INTO plan_imports(id,project_id,actor_id,filename,state,data) VALUES($1,$2,$3,$4,$5,$6)',
    [id, projectId, user.id, filename, 'preview', JSON.stringify({ entries })],
  );
  return { id, entries };
}
export async function commitImport(tx, user, id, decisions) {
  const report = (
    await tx.query('SELECT * FROM plan_imports WHERE id=$1 AND actor_id=$2 FOR UPDATE', [
      id,
      user.id,
    ])
  ).rows[0];
  if (!report) fail(404, 'Aperçu inaccessible.');
  if (report.state !== 'preview') fail(409, 'Cet import a déjà été validé.');
  const state = await snapshot(tx, user);
  if (!state.projects.some((p) => p.id === report.project_id)) fail(403, 'Projet inaccessible.');
  const results = [];
  for (const entry of report.data.entries) {
    const decision = decisions?.[entry.line] || 'apply';
    if (decision === 'skip') {
      results.push({ line: entry.line, result: 'Ignorée' });
      continue;
    }
    if (entry.state === 'error') fail(422, `Ligne ${entry.line} : corrigez ou ignorez l’erreur.`);
    if (['conflict', 'confirm'].includes(entry.state) && decision !== 'overwrite')
      fail(409, `Ligne ${entry.line} : résolution explicite requise.`);
    const result = await mutate(
      tx,
      user,
      'actions',
      entry.current?.id || null,
      entry.data,
      entry.expectedVersion,
      entry.current ? 'update' : 'create',
    );
    results.push({
      line: entry.line,
      id: result.id,
      result: entry.current ? 'Modifiée' : 'Créée',
      resolution: decision,
    });
  }
  await tx.query('UPDATE plan_imports SET state=$1,data=$2 WHERE id=$3', [
    'committed',
    JSON.stringify({ ...report.data, results }),
    id,
  ]);
  return { id, results };
}
