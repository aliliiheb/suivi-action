import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { connectDatabase } from '../../server/plans/db.mjs';
import { createApp } from '../../server/plans/app.mjs';
import { mutate, exclusive, snapshot } from '../../server/plans/service.mjs';
import {
  late,
  variance,
  progress,
  duration,
  actionSchema,
  parse,
} from '../../server/plans/rules.mjs';
import { exportFile, readFileRows } from '../../server/plans/files.mjs';
import { previewImport, commitImport } from '../../server/plans/imports.mjs';
import {
  normalizeDate,
  normalizeNumber,
  resolveReference,
} from '../../server/plans/import-normalization.mjs';
let db, admin, chef, pilot, outsider, client, project, module, action, server, base;
const password = 'Test-only-password-2026';
const make = (actor, kind, data) =>
  exclusive(db, actor.id, (tx, user) => mutate(tx, user, kind, null, data, null, 'create'));
const clean = (a) => {
  const { id: _id, version: _version, ...data } = a;
  return data;
};
before(async () => {
  db = await connectDatabase({ directory: ':memory:' });
  admin = { id: randomUUID(), name: 'Admin', role: 'ADMIN', active: true };
  await db.query(
    'INSERT INTO plan_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',
    [admin.id, admin.name, 'admin@test.fr', admin.role, await bcrypt.hash(password, 4)],
  );
  chef = await make(admin, 'users', {
    name: 'Chef',
    email: 'chef@test.fr',
    role: 'CHEF',
    active: true,
    password,
  });
  pilot = await make(admin, 'users', {
    name: 'Pilote',
    email: 'pilote@test.fr',
    role: 'PILOTE',
    active: true,
    password,
  });
  outsider = await make(admin, 'users', {
    name: 'Autre',
    email: 'autre@test.fr',
    role: 'PILOTE',
    active: true,
    password,
  });
  client = await make(admin, 'clients', { code: 'C1', name: 'Client fictif', contact: '' });
  project = await make(admin, 'projects', {
    code: 'P1',
    name: 'Projet fictif',
    client_id: client.id,
    manager_id: chef.id,
    members: [chef.id, pilot.id],
    description: 'Test',
    planned_start: '2026-01-01',
    planned_end: '2026-12-31',
  });
  module = await make(chef, 'modules', {
    code: 'M1',
    name: 'Module',
    description: '',
    project_id: project.id,
  });
  action = await make(chef, 'actions', {
    code: 'A1',
    description: 'Action initiale',
    objective: 'Réduire les défauts',
    module_id: module.id,
    pilot_id: pilot.id,
    planned_start: '2026-01-01',
    planned_end: '2026-02-28',
    actual_start: '',
    actual_end: '',
    status: 'À faire',
    progress: 0,
    cause: '',
    target: 10,
    achieved: 4,
    unit: 'unités',
    corrective: [],
  });
  const app = createApp(db, {
    secret: 'test-session-secret-over-thirty-two-characters',
    origin: 'http://localhost:1420',
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/plans`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db?.close();
});
const current = async () => (await snapshot(db, admin)).actions.find((a) => a.id === action.id);
test('Dates, objectifs qualitatifs, avancement et retard indépendant du statut', () => {
  assert.equal(late(action, '2026-03-01'), true);
  assert.equal(late({ ...action, status: 'Bloquée' }, '2026-03-01'), true);
  assert.equal(late({ ...action, status: 'Terminée' }, '2026-03-01'), false);
  assert.equal(late(action, '2026-02-28'), false);
  assert.equal(variance(action), -6);
  assert.equal(variance({ ...action, target: null }), null);
  assert.equal(progress([]), null);
  assert.equal(progress([{ progress: 20 }, { progress: 80 }]), 50);
  assert.equal(duration({ planned_start: '2026-01-01', planned_end: '2026-01-01' }), 1);
  for (const change of [
    { planned_end: '2026-02-30' },
    { planned_end: '2025-12-31' },
    { progress: 101 },
    { status: 'Terminée', progress: 50 },
    { actual_end: '2026-02-01' },
    { target: null, achieved: 3 },
  ])
    assert.throws(() => parse(actionSchema, { ...clean(action), ...change }));
});
test('Permissions : lecture cloisonnée, chef responsable et pilote attribué', async () => {
  assert.equal((await snapshot(db, outsider)).actions.length, 0);
  await assert.rejects(
    () => make(pilot, 'clients', { code: 'BAD', name: 'Interdit', contact: '' }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => make(pilot, 'actions', { ...clean(action), code: 'BAD' }),
    (e) => e.status === 403,
  );
  const a = await current();
  await assert.rejects(
    () =>
      exclusive(db, pilot.id, (tx, u) =>
        mutate(tx, u, 'actions', a.id, { ...clean(a), pilot_id: chef.id }, a.version),
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      exclusive(db, outsider.id, (tx, u) =>
        mutate(tx, u, 'actions', a.id, { ...clean(a), progress: 20 }, a.version),
      ),
    (e) => e.status === 404,
  );
  await exclusive(db, pilot.id, (tx, u) =>
    mutate(tx, u, 'actions', a.id, { ...clean(a), progress: 20, status: 'En cours' }, a.version),
  );
});
test('Deux modifications simultanées : une réussit, l’autre reçoit un conflit', async () => {
  const a = await current();
  const results = await Promise.allSettled(
    [30, 40].map((value) =>
      exclusive(db, chef.id, (tx, u) =>
        mutate(tx, u, 'actions', a.id, { ...clean(a), progress: value }, a.version),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  const history = (await db.query('SELECT * FROM plan_audit WHERE entity_id=$1', [a.id])).rows;
  assert.equal(history.length, 3);
  assert.equal(history.at(-1).actor_id, chef.id);
});
test('Export Excel → modification → aperçu → réimportation, sans suppression des absentes', async () => {
  const a = await current();
  const extra = await make(chef, 'actions', {
    ...clean(a),
    code: 'A2',
    description: 'À conserver',
  });
  const buffer = await exportFile('xlsx', project, [a], [module], [chef, pilot]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  wb.getWorksheet('Actions').getCell('E2').value = 'Description modifiée dans Excel';
  wb.getWorksheet('Actions').getCell('M2').value = 60;
  const parsed = await readFileRows('plan.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.xlsx', ...parsed }),
  );
  assert.equal(preview.entries[0].state, 'update');
  await exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {}));
  assert.equal((await current()).description, 'Description modifiée dans Excel');
  assert.equal((await current()).progress, 60);
  assert.ok((await snapshot(db, admin)).actions.find((a) => a.id === extra.id));
  await assert.rejects(
    () => exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {})),
    (e) => e.status === 409,
  );
});
test('Word structuré : édition et réimportation ; Word libre refusé', async () => {
  const a = await current();
  const buffer = await exportFile('docx', project, [a], [module], [pilot]);
  const zip = new AdmZip(buffer);
  zip.updateFile(
    'word/document.xml',
    Buffer.from(
      zip
        .readAsText('word/document.xml')
        .replaceAll('Description modifiée dans Excel', 'Description modifiée dans Word'),
    ),
  );
  const parsed = await readFileRows('plan.docx', zip.toBuffer());
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.docx', ...parsed }),
  );
  assert.equal(preview.entries[0].state, 'update');
  await exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {}));
  assert.equal((await current()).description, 'Description modifiée dans Word');
  zip.updateFile(
    'word/document.xml',
    Buffer.from(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Libre</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  await assert.rejects(
    () => readFileRows('libre.docx', zip.toBuffer()),
    (e) => e.status === 422,
  );
});
test('Conflits import : résolution explicite et revalidation à la validation finale', async () => {
  const a = await current();
  const parsed = await readFileRows(
    'plan.xlsx',
    await exportFile('xlsx', project, [{ ...a, version: a.version - 1 }], [module], [pilot]),
  );
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.xlsx', ...parsed }),
  );
  assert.equal(preview.entries[0].state, 'conflict');
  await assert.rejects(
    () => exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {})),
    (e) => e.status === 409,
  );
  await exclusive(db, chef.id, (tx, u) =>
    mutate(tx, u, 'actions', a.id, { ...clean(a), progress: 70 }, a.version),
  );
  await assert.rejects(
    () => exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, { 2: 'overwrite' })),
    (e) => e.status === 409,
  );
  assert.equal((await current()).progress, 70);
  const fresh = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.xlsx', ...parsed }),
  );
  await exclusive(db, chef.id, (tx, u) => commitImport(tx, u, fresh.id, { 2: 'overwrite' }));
});
test('Doublons, correspondances sans identifiants et import interdit', async () => {
  const a = await current();
  const parsed = await readFileRows(
    'plan.xlsx',
    await exportFile('xlsx', project, [a, a], [module], [pilot]),
  );
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.xlsx', ...parsed }),
  );
  assert.equal(preview.entries[1].state, 'error');
  assert.match(preview.entries[1].errors.join(), /Doublon/);
  await assert.rejects(
    () => exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {})),
    (e) => e.status === 422,
  );
  const noIds = {
    ...parsed,
    rows: [parsed.rows[0]],
    mapping: { ...parsed.mapping, id: '', version: '' },
  };
  const matched = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'existant.xlsx', ...noIds }),
  );
  assert.equal(matched.entries[0].state, 'confirm');
  await exclusive(db, chef.id, (tx, u) => commitImport(tx, u, matched.id, { 2: 'overwrite' }));
  await assert.rejects(
    () =>
      exclusive(db, outsider.id, (tx, u) =>
        previewImport(tx, u, { projectId: project.id, filename: 'interdit.xlsx', ...parsed }),
      ),
    (e) => e.status === 403,
  );
});
test('API : connexion, CSRF, export protégé, cookies et révocation', async () => {
  assert.equal((await fetch(base + '/state')).status, 401);
  const session = await fetch(base + '/session');
  let cookie = session.headers.get('set-cookie').split(';')[0];
  const { csrf } = await session.json();
  assert.equal(
    (
      await fetch(base + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ email: 'pilote@test.fr', password }),
      })
    ).status,
    403,
  );
  const login = await fetch(base + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ email: 'pilote@test.fr', password }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const logged = await login.json();
  assert.equal((await fetch(base + '/state', { headers: { cookie } })).status, 200);
  assert.equal(
    (await fetch(base + `/projects/${project.id}/export/xlsx`, { headers: { cookie } })).status,
    200,
  );
  assert.equal(
    (await fetch(base + '/projects/unknown/export/xlsx', { headers: { cookie } })).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + '/clients', {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/json', 'x-csrf-token': logged.csrf },
        body: JSON.stringify({ data: { code: 'NO', name: 'No', contact: '' } }),
      })
    ).status,
    403,
  );
  const logout = await fetch(base + '/logout', {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': logged.csrf },
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(base + '/state', { headers: { cookie } })).status, 401);
});

test('Import existant : dates françaises, virgules et références exactes', async () => {
  assert.equal(normalizeDate('28/02/2026'), '2026-02-28');
  assert.equal(normalizeNumber('1\u202f234,5'), 1234.5);
  assert.equal(normalizeNumber('65 %'), 65);
  assert.ok(Number.isNaN(normalizeNumber('5 jours')));
  assert.throws(
    () =>
      resolveReference(
        'Même nom',
        [
          { id: '1', name: 'Même nom' },
          { id: '2', name: 'Même nom' },
        ],
        ['name'],
        'Responsable',
      ),
    (e) => e.status === 422,
  );
  const a = await current();
  const data = await readFileRows(
    'source.xlsx',
    await exportFile('xlsx', project, [a], [module], [pilot]),
  );
  const index = (key) => data.headers.indexOf(data.mapping[key]);
  data.rows[0][index('module_id')] = module.code;
  data.rows[0][index('pilot_id')] = pilot.email;
  data.rows[0][index('planned_end')] = '28/02/2026';
  data.rows[0][index('progress')] = '62,5';
  const preview = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'source.xlsx', ...data }),
  );
  assert.equal(preview.entries[0].state, 'update');
  assert.equal(preview.entries[0].data.planned_end, '2026-02-28');
  assert.equal(preview.entries[0].data.progress, 62.5);
  assert.equal(preview.entries[0].data.pilot_id, pilot.id);
  await exclusive(db, chef.id, (tx, u) => commitImport(tx, u, preview.id, {}));
});

test('Excel : pourcentages natifs, dates et commentaires en lecture seule', async () => {
  const a = await current();
  const buffer = await exportFile(
    'xlsx',
    project,
    [{ ...a, comments: 'Commentaire exporté' }],
    [module],
    [pilot],
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Actions');
  assert.ok(sheet.getCell('H2').value instanceof Date);
  assert.equal(sheet.getCell('H2').numFmt, 'dd/mm/yyyy');
  assert.equal(sheet.getCell('U2').value, 'Commentaire exporté');
  sheet.getCell('M2').value = 0.625;
  sheet.getCell('M2').numFmt = '0.0%';
  const parsed = await readFileRows('natif.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(parsed.rows[0][12], '62.5');
  assert.equal(parsed.rows[0][7], a.planned_start);
  sheet.getCell('M2').value = { formula: '1+1', result: 2 };
  await assert.rejects(
    async () => readFileRows('formule.xlsx', Buffer.from(await wb.xlsx.writeBuffer())),
    (e) => e.status === 422,
  );
});

test('Revalidation des permissions entre aperçu et application de l’import', async () => {
  const a = await current();
  const parsed = await readFileRows(
    'plan.xlsx',
    await exportFile('xlsx', project, [a], [module], [pilot]),
  );
  const preview = await exclusive(db, pilot.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'plan.xlsx', ...parsed }),
  );
  assert.equal(preview.entries[0].state, 'update');
  const { id, version, ...data } = pilot;
  const changed = await exclusive(db, admin.id, (tx, u) =>
    mutate(tx, u, 'users', id, { ...data, role: 'CHEF' }, version),
  );
  await assert.rejects(
    () => exclusive(db, pilot.id, (tx, u) => commitImport(tx, u, preview.id, {})),
    (e) => e.status === 403,
  );
  assert.equal((await current()).version, a.version);
  pilot = await exclusive(db, admin.id, (tx, u) =>
    mutate(tx, u, 'users', id, data, changed.version),
  );
});

test('Rejet des fichiers non compatibles et migrations versionnées', async () => {
  await assert.rejects(
    () => readFileRows('document.pdf', Buffer.from('PDF')),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => readFileRows('faux.xlsx', Buffer.from('fichier texte')),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => readFileRows('grand.xlsx', Buffer.alloc(5 * 1024 * 1024 + 1)),
    (e) => e.status === 413,
  );
  const versions = (await db.query('SELECT version FROM plan_migrations ORDER BY version')).rows;
  assert.deepEqual(
    versions.map((v) => v.version),
    [1, 2, 3],
  );
});

test('Deux échéances supplémentaires : validation, droits et aller-retour Excel/Word', async () => {
  const data = { ...clean(await current()), deadline_2: '2026-03-15', deadline_3: '2026-04-01' };
  for (const change of [
    { deadline_2: '2026-02-30' },
    { deadline_2: '2026-01-01' },
    { deadline_3: '2026-03-01' },
    { deadline_2: '' },
  ])
    assert.throws(() => parse(actionSchema, { ...data, ...change }));
  const saved = await make(chef, 'actions', { ...data, code: 'DATES-23' });
  await assert.rejects(
    () =>
      exclusive(db, pilot.id, (tx, u) =>
        mutate(
          tx,
          u,
          'actions',
          saved.id,
          { ...clean(saved), deadline_3: '2026-05-01' },
          saved.version,
        ),
      ),
    (e) => e.status === 403,
  );
  for (const format of ['xlsx', 'docx']) {
    const parsed = await readFileRows(
      `dates.${format}`,
      await exportFile(format, project, [saved], [module], [pilot]),
    );
    const preview = await exclusive(db, chef.id, (tx, u) =>
      previewImport(tx, u, { projectId: project.id, filename: `dates.${format}`, ...parsed }),
    );
    assert.equal(preview.entries[0].data.deadline_2, '2026-03-15');
    assert.equal(preview.entries[0].data.deadline_3, '2026-04-01');
  }
  const oldFile = await readFileRows(
    'ancien.xlsx',
    await exportFile('xlsx', project, [saved], [module], [pilot]),
  );
  delete oldFile.mapping.deadline_2;
  delete oldFile.mapping.deadline_3;
  const preserved = await exclusive(db, chef.id, (tx, u) =>
    previewImport(tx, u, { projectId: project.id, filename: 'ancien.xlsx', ...oldFile }),
  );
  assert.equal(preserved.entries[0].data.deadline_3, '2026-04-01');
});
