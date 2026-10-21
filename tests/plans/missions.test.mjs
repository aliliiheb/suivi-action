import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { connectDatabase } from '../../server/plans/db.mjs';
import { mutate, exclusive, snapshot } from '../../server/plans/service.mjs';
import { duplicate } from '../../server/plans/duplication.mjs';
import { addDocument, getDocument, changeDocument } from '../../server/plans/documents.mjs';
import { createApp } from '../../server/plans/app.mjs';
import { exportFile, readFileRows, columns } from '../../server/plans/files.mjs';
import { previewImport, commitImport } from '../../server/plans/imports.mjs';
let db,
  admin,
  chef,
  pilot,
  other,
  client,
  company2,
  project,
  secondProject,
  module,
  action,
  mission,
  server,
  base;
const clean = ({ id: _id, version: _v, ...d }) => d;
const make = (u, kind, data) =>
  exclusive(db, u.id, (tx, actor) => mutate(tx, actor, kind, null, data, null, 'create'));
const edit = (u, kind, row, data) =>
  exclusive(db, u.id, (tx, actor) =>
    mutate(tx, actor, kind, row.id, { ...clean(row), ...data }, row.version),
  );
const password = 'QA-missions-password-2026';
const pdf = Buffer.from('%PDF-1.4\n%%EOF');
before(async () => {
  db = await connectDatabase({ url: '', directory: ':memory:' });
  admin = { id: randomUUID(), role: 'ADMIN', active: true };
  await db.query(
    'INSERT INTO plan_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',
    [admin.id, 'Admin', 'admin@missions.test', 'ADMIN', await bcrypt.hash(password, 4)],
  );
  chef = await make(admin, 'users', {
    name: 'Chef',
    email: 'chef@missions.test',
    role: 'CHEF',
    active: true,
    password,
  });
  pilot = await make(admin, 'users', {
    name: 'Pilote',
    email: 'pilot@missions.test',
    role: 'PILOTE',
    active: true,
    password,
  });
  other = await make(admin, 'users', {
    name: 'Autre chef',
    email: 'other@missions.test',
    role: 'CHEF',
    active: true,
    password,
  });
  client = await make(admin, 'clients', { code: 'C1', name: 'FMS TUNISIE', contact: '' });
  company2 = await make(admin, 'clients', { code: 'C2', name: 'SBC ALGÉRIE', contact: '' });
  project = await make(admin, 'projects', {
    code: 'P1',
    name: 'Projet principal',
    description: 'original',
    client_id: client.id,
    manager_id: chef.id,
    members: [chef.id, pilot.id],
    planned_start: '2026-01-01',
    planned_end: '2027-12-31',
  });
  secondProject = await make(admin, 'projects', {
    ...clean(project),
    code: 'P2',
    name: 'Autre projet',
  });
  module = await make(chef, 'modules', {
    code: 'M1',
    name: 'Module',
    description: 'original',
    project_id: project.id,
  });
  action = await make(chef, 'actions', {
    code: 'A1',
    description: 'Originale',
    module_id: module.id,
    pilot_id: pilot.id,
    mission_number: 'ANCIEN-42',
    status: 'À faire',
    progress: 0,
    planned_start: '2026-01-01',
    planned_end: '2026-12-31',
  });
  mission = await make(chef, 'missions', {
    number: 'mis-001',
    title: 'Audit',
    description: 'Détails',
    client_id: client.id,
    project_id: project.id,
    manager_id: chef.id,
    members: [chef.id, pilot.id],
    location: 'FSP ALGERIE',
    planned_start: '2026-01-01',
    planned_end: '2026-12-31',
    status: 'Planifiée',
    priority: 'Haute',
  });
  const app = createApp(db, {
    secret: 'test-missions-secret-at-least-thirty-two',
    production: false,
    origin: 'http://localhost:1420',
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/plans`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});
test('Mission : unicité métier, validations et ancien numéro sans rapprochement automatique', async () => {
  assert.equal(mission.number, 'MIS-001');
  const state = await snapshot(db, admin);
  assert.equal(state.missions.length, 1);
  assert.equal(state.actions[0].mission_number, 'ANCIEN-42');
  assert.equal(state.actions[0].mission_id, '');
  await assert.rejects(
    () => make(chef, 'missions', { ...clean(mission), number: '  Mis-001  ' }),
    (e) => e.code === '23505',
  );
  for (const data of [
    { planned_end: '2025-01-01' },
    { status: 'Terminée' },
    { actual_end: '2026-04-01' },
    { location: 'AUTRE (à préciser)', location_other: '' },
    { project_id: randomUUID() },
    { manager_id: pilot.id },
    { client_id: company2.id },
  ])
    await assert.rejects(() => edit(chef, 'missions', mission, data));
  const before = await snapshot(db, admin);
  const results = await Promise.allSettled(
    [1, 2].map(() => make(chef, 'missions', { ...clean(mission), number: 'CONCURRENT' })),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await snapshot(db, admin)).missions.length, before.missions.length + 1);
});
test('Missions : visibilité, permissions, documents et relations entre sociétés', async () => {
  assert.ok((await snapshot(db, pilot)).missions.some((m) => m.id === mission.id));
  assert.equal((await snapshot(db, other)).missions.length, 0);
  await assert.rejects(
    () => edit(pilot, 'missions', mission, { title: 'Interdit' }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => edit(other, 'missions', mission, { title: 'Interdit' }),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => make(pilot, 'missions', { ...clean(mission), number: 'PILOT', manager_id: pilot.id }),
    (e) => e.status === 403,
  );
  const doc = await exclusive(db, chef.id, (tx, u) =>
    addDocument(
      tx,
      u,
      mission.id,
      { filename: 'rapport.pdf', base64: pdf.toString('base64'), request_id: randomUUID() },
      'missions',
    ),
  );
  assert.equal((await getDocument(db, pilot, doc.id)).mission_id, mission.id);
  await assert.rejects(
    () => getDocument(db, other, doc.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => exclusive(db, pilot.id, (tx, u) => changeDocument(tx, u, doc.id, { version: 1 }, true)),
    (e) => e.status === 403,
  );
  const cross = await make(admin, 'missions', {
    ...clean(mission),
    number: 'CROSS',
    client_id: company2.id,
    project_id: '',
  });
  await assert.rejects(
    () => edit(admin, 'actions', action, { mission_id: cross.id }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => edit(other, 'actions', action, { mission_id: mission.id }),
    (e) => e.status === 404,
  );
});
test('Associations multiples : mission renommée sans modifier le métier ni la référence historique', async () => {
  project = await edit(chef, 'projects', project, { mission_id: mission.id });
  secondProject = await edit(chef, 'projects', secondProject, { mission_id: mission.id });
  module = await edit(chef, 'modules', module, { mission_id: mission.id });
  action = await edit(chef, 'actions', action, { mission_id: mission.id });
  const before = await snapshot(db, admin);
  mission = await edit(chef, 'missions', mission, {
    number: 'MIS-RENOMMEE',
    title: 'Audit modifié',
  });
  const after = await snapshot(db, admin);
  assert.deepEqual(after.actions, before.actions);
  assert.deepEqual(after.modules, before.modules);
  assert.deepEqual(after.projects, before.projects);
  assert.equal(after.actions[0].mission_number, 'ANCIEN-42');
  await assert.rejects(
    () => edit(admin, 'missions', mission, { client_id: company2.id, project_id: '' }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => edit(admin, 'projects', project, { client_id: company2.id, mission_id: '' }),
    (e) => e.status === 422,
  );
  const history = (await db.query('SELECT * FROM plan_audit WHERE entity_id=$1', [mission.id]))
    .rows;
  assert.equal(history.filter((h) => h.operation === 'Association').length, 4);
  assert.ok(
    history.some(
      (h) => h.before_data?.number === 'MIS-001' && h.after_data?.number === 'MIS-RENOMMEE',
    ),
  );
  // Old callers omitting mission_id must retain the existing association.
  const legacy = clean(action);
  delete legacy.mission_id;
  action = await exclusive(db, chef.id, (tx, u) =>
    mutate(tx, u, 'actions', action.id, legacy, action.version),
  );
  assert.equal(action.mission_id, mission.id);
});
test('Rapports : liens Mission Word/Excel, imports anciens conservant les associations', async () => {
  const options = { origin: 'https://example.test', missions: [mission] };
  const excel = await exportFile('xlsx', project, [action], [module], [chef, pilot], options);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excel);
  const sheet = workbook.getWorksheet('Actions');
  const row = sheet.getRow(2);
  const column = Object.keys(columns).indexOf('mission_number') + 1;
  assert.equal(row.getCell(column).value.text, mission.number);
  assert.equal(
    row.getCell(column).value.hyperlink,
    `https://example.test/plans?mission=${mission.id}`,
  );
  const word = await exportFile('docx', project, [action], [module], [chef, pilot], options);
  const zip = new AdmZip(word);
  assert.match(zip.readAsText('word/_rels/document.xml.rels'), new RegExp(mission.id));
  assert.match(zip.readAsText('word/document.xml'), /w:hyperlink/);
  const imported = await readFileRows('report.docx', word);
  assert.ok(imported.headers.includes('Identifiant mission'));
  // Existing exports lacking an association column keep the current mission.
  const read = await readFileRows('report.xlsx', excel);
  const index = read.headers.indexOf('Identifiant mission');
  read.headers.splice(index, 1);
  read.rows.forEach((r) => r.splice(index, 1));
  const mapping = Object.fromEntries(
    Object.entries(columns).filter(([, v]) => read.headers.includes(v)),
  );
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'old.xlsx', ...read, mapping }),
  );
  const importedResult = await exclusive(db, chef.id, (tx, u) =>
    commitImport(tx, u, preview.id, {}),
  );
  assert.ok(importedResult);
  action = (await snapshot(db, admin)).actions.find((a) => a.id === action.id);
  assert.equal(action.mission_id, mission.id);
});
test('Duplication de mission : remise à zéro, nouvelle identité, idempotence et aucune association copiée', async () => {
  mission = await edit(chef, 'missions', mission, {
    status: 'Terminée',
    actual_start: '2026-01-01',
    actual_end: '2026-10-01',
    observations: 'Suivi privé original',
  });
  const body = {
    request_id: randomUUID(),
    version: mission.version,
    data: { ...clean(mission), number: 'COPIE-MISSION', project_id: secondProject.id },
  };
  const copies = await Promise.all(
    [1, 2].map(() =>
      exclusive(db, chef.id, (tx, u) => duplicate(tx, u, 'missions', mission.id, body)),
    ),
  );
  assert.equal(copies[0].id, copies[1].id);
  const copy = copies[0];
  assert.equal(copy.status, 'Planifiée');
  assert.equal(copy.actual_end, '');
  assert.equal(copy.observations, '');
  assert.notEqual(copy.id, mission.id);
  assert.equal(
    (await db.query('SELECT id FROM plan_documents WHERE mission_id=$1', [copy.id])).rows.length,
    0,
  );
  assert.ok((await snapshot(db, admin)).actions.every((a) => a.mission_id !== copy.id));
  assert.deepEqual(
    (await snapshot(db, admin)).missions.find((m) => m.id === mission.id),
    mission,
  );
  assert.equal(
    (await db.query('SELECT source_id FROM plan_duplications WHERE target_id=$1', [copy.id]))
      .rows[0].source_id,
    mission.id,
  );
});
test('Archivage : conservation des liens, historique, documents et blocage des nouvelles associations', async () => {
  const archive = await edit(chef, 'missions', mission, { archived: true });
  mission = archive;
  const doc = (await db.query('SELECT id FROM plan_documents WHERE mission_id=$1', [mission.id]))
    .rows[0];
  assert.ok(await getDocument(db, pilot, doc.id));
  const newAction = await make(chef, 'actions', {
    ...clean(action),
    code: 'A-NEW',
    mission_id: '',
  });
  await assert.rejects(
    () => edit(chef, 'actions', newAction, { mission_id: mission.id }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () =>
      exclusive(db, chef.id, (tx, u) =>
        mutate(tx, u, 'missions', mission.id, null, mission.version, 'delete'),
      ),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () =>
      exclusive(db, chef.id, (tx, u) =>
        addDocument(
          tx,
          u,
          mission.id,
          { filename: 'no.pdf', base64: pdf.toString('base64'), request_id: randomUUID() },
          'missions',
        ),
      ),
    (e) => e.status === 422,
  );
  assert.ok(
    (
      await db.query("SELECT id FROM plan_audit WHERE entity_id=$1 AND operation='Archivage'", [
        mission.id,
      ])
    ).rows.length,
  );
  mission = await edit(chef, 'missions', mission, { archived: false });
});
test('API Missions : réaffectation, dissociation, traçabilité, documents et accès protégés', async () => {
  const session = await fetch(base + '/session');
  let cookie = session.headers.get('set-cookie').split(';')[0];
  let { csrf } = await session.json();
  const logged = await fetch(base + '/login', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ email: 'admin@missions.test', password }),
  });
  assert.equal(logged.status, 200);
  cookie = logged.headers.get('set-cookie').split(';')[0];
  csrf = (await logged.json()).csrf;
  const headers = { cookie, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + `/missions/${mission.id}/history`)).status, 401);
  assert.equal((await fetch(base + `/missions/${mission.id}/documents`, { headers })).status, 200);
  const copy = (await snapshot(db, admin)).missions.find((m) => m.number === 'COPIE-MISSION');
  let response = await fetch(base + `/missions/${copy.id}/links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'actions', entity_id: action.id, version: action.version }),
  });
  assert.equal(response.status, 200);
  action = await response.json();
  assert.equal(action.mission_id, copy.id);
  response = await fetch(base + `/missions/${copy.id}/links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'actions',
      entity_id: action.id,
      version: action.version,
      detach: true,
    }),
  });
  assert.equal(response.status, 200);
  action = await response.json();
  assert.equal(action.mission_id, '');
  const history = await (await fetch(base + `/missions/${copy.id}/history`, { headers })).json();
  assert.ok(history.some((h) => h.operation === 'Dissociation'));
  assert.ok(history.some((h) => h.operation === 'Association'));
  assert.equal(
    (
      await fetch(base + `/missions/${copy.id}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'Commentaire mission' }),
      })
    ).status,
    200,
  );
  assert.equal((await fetch(base + `/missions/${copy.id}/provenance`, { headers })).status, 200);
  await fetch(base + '/logout', { method: 'POST', headers });
});
