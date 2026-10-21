import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import locations from '../../server/plans/location-options.json' with { type: 'json' };
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
import { duplicate } from '../../server/plans/duplication.mjs';
import {
  addDocument,
  changeDocument,
  getDocument,
  validateFile,
  quota,
} from '../../server/plans/documents.mjs';
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
  assert.equal(sheet.getCell('Z2').value, 'Commentaire exporté');
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
    [1, 2, 3, 4, 5, 6],
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

test('Emplacements, mission et référence : validation, conservation et imports', async () => {
  const data = clean(await current());
  assert.equal(locations.length, 11);
  for (const location of locations) {
    assert.equal(
      parse(actionSchema, {
        ...data,
        location,
        location_other: location.startsWith('AUTRE') ? 'Site personnalisé' : '',
      }).location,
      location,
    );
  }
  for (const change of [
    { location: 'inconnu' },
    { location: 'AUTRE (à préciser)', location_other: '  ' },
    { location: 'FMS TUNISIE', location_other: 'Site' },
    { mission_number: 'X'.repeat(121) },
  ])
    assert.throws(() => parse(actionSchema, { ...data, ...change }));
  let saved = await make(chef, 'actions', {
    ...data,
    code: 'META',
    location: 'AUTRE (à préciser)',
    location_other: 'Atelier Nord',
    mission_number: 'MIS-001',
    priority_reference: 'PRI-007',
  });
  const legacy = clean(saved);
  for (const key of ['location', 'location_other', 'mission_number', 'priority_reference'])
    delete legacy[key];
  saved = await exclusive(db, chef.id, (tx, u) =>
    mutate(tx, u, 'actions', saved.id, legacy, saved.version),
  );
  assert.equal(saved.mission_number, 'MIS-001');
  await assert.rejects(
    () =>
      exclusive(db, pilot.id, (tx, u) =>
        mutate(
          tx,
          u,
          'actions',
          saved.id,
          { ...clean(saved), mission_number: 'interdit' },
          saved.version,
        ),
      ),
    (e) => e.status === 403,
  );
  for (const format of ['xlsx', 'docx']) {
    const parsed = await readFileRows(
      `meta.${format}`,
      await exportFile(format, project, [saved], [module], [pilot]),
    );
    const preview = await exclusive(db, chef.id, (tx, u) =>
      previewImport(tx, u, { projectId: project.id, filename: `meta.${format}`, ...parsed }),
    );
    assert.deepEqual(
      ['location', 'location_other', 'mission_number', 'priority_reference'].map(
        (k) => preview.entries[0].data[k],
      ),
      ['AUTRE (à préciser)', 'Atelier Nord', 'MIS-001', 'PRI-007'],
    );
  }
});

test('Modules : rattachement, cycles indirects, cloisonnement, suppression et concurrence', async () => {
  const root = await make(chef, 'modules', {
    code: 'ROOT',
    name: 'Principal',
    description: '',
    project_id: project.id,
  });
  const child = await make(chef, 'modules', {
    code: 'CHILD',
    name: 'Enfant',
    description: '',
    project_id: project.id,
    parent_module_id: root.id,
  });
  const grandchild = await make(chef, 'modules', {
    code: 'GRAND',
    name: 'Petit enfant',
    description: '',
    project_id: project.id,
    parent_module_id: child.id,
  });
  for (const parent_module_id of [root.id, grandchild.id, 'inconnu'])
    await assert.rejects(
      () =>
        exclusive(db, chef.id, (tx, u) =>
          mutate(tx, u, 'modules', root.id, { ...clean(root), parent_module_id }, root.version),
        ),
      (e) => e.status === 422,
    );
  await assert.rejects(
    () =>
      exclusive(db, chef.id, (tx, u) =>
        mutate(tx, u, 'modules', root.id, null, root.version, 'delete'),
      ),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => make(pilot, 'modules', { ...clean(root), code: 'PILOT' }),
    (e) => e.status === 403,
  );
  const otherProject = await make(admin, 'projects', { ...clean(project), code: 'OTHER-PROJECT' });
  await assert.rejects(
    () =>
      make(admin, 'modules', {
        ...clean(root),
        code: 'CROSS',
        project_id: otherProject.id,
        parent_module_id: root.id,
      }),
    (e) => e.status === 422,
  );
  const a = await make(chef, 'modules', { ...clean(root), code: 'CYCLE-A' });
  const b = await make(chef, 'modules', { ...clean(root), code: 'CYCLE-B' });
  const results = await Promise.allSettled([
    exclusive(db, chef.id, (tx, u) =>
      mutate(tx, u, 'modules', a.id, { ...clean(a), parent_module_id: b.id }, a.version),
    ),
    exclusive(db, chef.id, (tx, u) =>
      mutate(tx, u, 'modules', b.id, { ...clean(b), parent_module_id: a.id }, b.version),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const detached = await exclusive(db, chef.id, (tx, u) =>
    mutate(tx, u, 'modules', child.id, { ...clean(child), parent_module_id: '' }, child.version),
  );
  assert.equal(detached.parent_module_id, '');
  await exclusive(db, chef.id, (tx, u) =>
    mutate(tx, u, 'modules', root.id, null, root.version, 'delete'),
  );
});

test('Migration additive : données et versions historiques conservées', async () => {
  const rollback = new Error('rollback-test');
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await tx.query('ALTER TABLE plan_modules DROP COLUMN parent_module_id CASCADE');
        await tx.query(
          "UPDATE plan_actions SET data=data-'location'-'location_other'-'mission_number'-'priority_reference'",
        );
        await tx.query("UPDATE plan_modules SET data=data-'parent_module_id'");
        const oldActions = (await tx.query('SELECT * FROM plan_actions ORDER BY id')).rows;
        const oldModules = (await tx.query('SELECT * FROM plan_modules ORDER BY id')).rows;
        const sql = await readFile(
          new URL(
            '../../server/plans/migrations/004_action_metadata_module_parent.sql',
            import.meta.url,
          ),
          'utf8',
        );
        for (const statement of sql.split(';').filter((s) => s.trim())) await tx.query(statement);
        const actions = (await tx.query('SELECT * FROM plan_actions ORDER BY id')).rows;
        const modules = (await tx.query('SELECT * FROM plan_modules ORDER BY id')).rows;
        assert.equal(actions.length, oldActions.length);
        actions.forEach((row, i) => {
          assert.equal(row.version, oldActions[i].version);
          for (const [k, v] of Object.entries(oldActions[i].data)) assert.deepEqual(row.data[k], v);
          assert.equal(row.data.location, '');
        });
        modules.forEach((row, i) => {
          assert.equal(row.version, oldModules[i].version);
          assert.deepEqual(row.data, { ...oldModules[i].data, parent_module_id: '' });
        });
        throw rollback;
      }),
    (e) => e === rollback,
  );
});

const clone = (actor, kind, source, data, options = {}) =>
  exclusive(db, actor.id, (tx, user) =>
    duplicate(tx, user, kind, source.id, {
      request_id: randomUUID(),
      version: source.version,
      data,
      ...options,
    }),
  );
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
test('Documents : formats, taille, droits, renommage, indépendance et suppression', async () => {
  assert.equal(validateFile('rapport.pdf', pdf), 'application/pdf');
  for (const ext of ['doc', 'xls', 'ppt'])
    assert.ok(validateFile(`rapport.${ext}`, Buffer.from('d0cf11e0a1b11ae1', 'hex')));
  for (const [ext, root] of [
    ['docx', 'word/'],
    ['xlsx', 'xl/'],
    ['pptx', 'ppt/'],
  ]) {
    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from('<Types/>'));
    zip.addFile(root + 'document.xml', Buffer.from('<document/>'));
    assert.ok(validateFile(`rapport.${ext}`, zip.toBuffer()));
    assert.throws(() => validateFile('faux.docx', pdf));
  }
  assert.ok(validateFile('photo.png', Buffer.from('89504e470d0a1a0a', 'hex')));
  for (const ext of ['jpg', 'jpeg'])
    assert.ok(validateFile(`photo.${ext}`, Buffer.from('ffd8ffe0', 'hex')));
  assert.ok(validateFile('photo.webp', Buffer.from('RIFFxxxxWEBP')));
  for (const filename of ['virus.exe', 'image.svg', '../secret.pdf', 'fausse.png'])
    assert.throws(() => validateFile(filename, pdf));
  assert.throws(() => validateFile('grand.pdf', Buffer.alloc(5242881)));
  assert.throws(() => validateFile('vide.pdf', Buffer.alloc(0)));
  const data = {
    filename: 'rapport.pdf',
    base64: pdf.toString('base64'),
    request_id: randomUUID(),
  };
  const doc = await exclusive(db, chef.id, (tx, u) => addDocument(tx, u, project.id, data));
  const repeated = await exclusive(db, chef.id, (tx, u) => addDocument(tx, u, project.id, data));
  assert.equal(doc.id, repeated.id);
  await assert.rejects(
    () =>
      exclusive(db, chef.id, (tx, u) =>
        addDocument(tx, u, project.id, { ...data, filename: 'autre.pdf' }),
      ),
    (e) => e.status === 409,
  );
  assert.equal((await getDocument(db, pilot, doc.id)).filename, 'rapport.pdf');
  await assert.rejects(
    () => getDocument(db, outsider, doc.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () =>
      exclusive(db, pilot.id, (tx, u) =>
        addDocument(tx, u, project.id, { ...data, request_id: randomUUID() }),
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => exclusive(db, pilot.id, (tx, u) => changeDocument(tx, u, doc.id, { version: 1 }, true)),
    (e) => e.status === 403,
  );
  await exclusive(db, chef.id, (tx, u) =>
    changeDocument(tx, u, doc.id, { version: 1, title: 'Nouveau titre' }),
  );
  await assert.rejects(
    () =>
      exclusive(db, chef.id, (tx, u) =>
        changeDocument(tx, u, doc.id, { version: 1, title: 'Conflit' }),
      ),
    (e) => e.status === 409,
  );
  const before = (await snapshot(db, admin)).projects.find((p) => p.id === project.id);
  const copy = await clone(
    admin,
    'projects',
    before,
    { ...clean(before), code: 'P-DOC-COPY' },
    { copy_documents: true },
  );
  const copied = (await db.query('SELECT * FROM plan_documents WHERE project_id=$1', [copy.id]))
    .rows[0];
  assert.notEqual(copied.id, doc.id);
  assert.deepEqual(Buffer.from(copied.content), pdf);
  assert.equal(copied.title, 'Nouveau titre');
  await exclusive(db, admin.id, (tx, u) => changeDocument(tx, u, copied.id, { version: 1 }, true));
  assert.ok(await getDocument(db, chef, doc.id));
  await exclusive(db, chef.id, (tx, u) => changeDocument(tx, u, doc.id, { version: 2 }, true));
  await assert.rejects(
    () => getDocument(db, chef, doc.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => quota(db, project.id, 51 * 1024 * 1024),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () =>
      quota(
        { query: async () => ({ rows: [{ total: 200 * 1024 * 1024, project: 0 }] }) },
        project.id,
        1,
      ),
    (e) => e.status === 422,
  );
});
test('Duplication : nouvelle société, module sans actions, réinitialisation et traçabilité', async () => {
  const state = await snapshot(db, admin);
  const source = state.projects.find((p) => p.id === project.id);
  const secondClient = await make(admin, 'clients', { code: 'C-DUP', name: 'SBC', contact: '' });
  const newProject = await clone(admin, 'projects', source, {
    ...clean(source),
    code: 'P-DUP',
    client_id: secondClient.id,
  });
  assert.notEqual(newProject.id, source.id);
  assert.equal(newProject.client_id, secondClient.id);
  assert.equal(
    (await db.query('SELECT id FROM plan_documents WHERE project_id=$1', [newProject.id])).rows
      .length,
    0,
  );
  const sourceModule = state.modules.find((m) => m.id === module.id);
  const newModule = await clone(admin, 'modules', sourceModule, {
    ...clean(sourceModule),
    project_id: newProject.id,
    code: 'M-DUP',
  });
  assert.equal(
    (await db.query('SELECT id FROM plan_actions WHERE module_id=$1', [newModule.id])).rows.length,
    0,
  );
  const sourceAction = state.actions.find((a) => a.id === action.id);
  const newAction = await clone(admin, 'actions', sourceAction, {
    ...clean(sourceAction),
    module_id: newModule.id,
    code: 'A-DUP',
    status: 'Terminée',
    progress: 100,
    actual_start: '2026-01-01',
    actual_end: '2026-01-02',
    achieved: 12,
    cause: 'Ne pas copier',
  });
  assert.equal(newAction.status, 'À faire');
  assert.equal(newAction.progress, 0);
  assert.equal(newAction.actual_start, '');
  assert.equal(newAction.actual_end, '');
  assert.equal(newAction.achieved, null);
  assert.equal(newAction.cause, '');
  assert.deepEqual(newAction.corrective, []);
  assert.equal(newAction.planned_start, sourceAction.planned_start);
  const trace = (
    await db.query('SELECT * FROM plan_duplications WHERE target_id=$1', [newAction.id])
  ).rows[0];
  assert.equal(trace.source_id, sourceAction.id);
  assert.equal(trace.actor_id, admin.id);
  assert.ok(trace.at);
  assert.equal(
    (
      await db.query("SELECT id FROM plan_audit WHERE entity_id=$1 AND operation='Commentaire'", [
        newAction.id,
      ])
    ).rows.length,
    0,
  );
  await exclusive(db, admin.id, (tx, u) =>
    mutate(
      tx,
      u,
      'actions',
      newAction.id,
      { ...clean(newAction), description: 'Copie modifiée' },
      1,
    ),
  );
  const after = await snapshot(db, admin);
  assert.deepEqual(
    after.actions.find((a) => a.id === action.id),
    sourceAction,
  );
  assert.deepEqual(
    after.projects.find((p) => p.id === project.id),
    source,
  );
  assert.deepEqual(
    after.modules.find((m) => m.id === module.id),
    sourceModule,
  );
});
test('Duplication : actions optionnelles, parent et pilote adaptés, transaction et double clic', async () => {
  const state = await snapshot(db, admin);
  const source = state.modules.find((m) => m.id === module.id);
  const dest = await make(admin, 'projects', {
    ...clean(project),
    code: 'P-DEST',
    members: [chef.id],
  });
  const body = {
    request_id: randomUUID(),
    version: source.version,
    data: { ...clean(source), code: 'M-DEST', project_id: dest.id, parent_module_id: '' },
    copy_actions: true,
  };
  const [first, second] = await Promise.all(
    [1, 2].map(() =>
      exclusive(db, admin.id, (tx, u) => duplicate(tx, u, 'modules', source.id, body)),
    ),
  );
  assert.equal(first.id, second.id);
  const after = await snapshot(db, admin);
  const actions = after.actions.filter((a) => a.module_id === first.id);
  assert.equal(actions.length, state.actions.filter((a) => a.module_id === source.id).length);
  assert.ok(
    actions.every((a) => a.progress === 0 && a.status === 'À faire' && a.pilot_id === chef.id),
  );
  await assert.rejects(
    () =>
      exclusive(db, admin.id, (tx, u) =>
        duplicate(tx, u, 'modules', source.id, { ...body, data: { ...body.data, code: 'OTHER' } }),
      ),
    (e) => e.status === 409,
  );
  const count = (await snapshot(db, admin)).modules.length;
  await assert.rejects(
    () =>
      clone(admin, 'modules', source, {
        ...clean(source),
        code: 'INVALID',
        project_id: dest.id,
        parent_module_id: source.id,
      }),
    (e) => e.status === 422,
  );
  assert.equal((await snapshot(db, admin)).modules.length, count);
  await assert.rejects(
    () => clone(pilot, 'modules', source, clean(source)),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => clone(outsider, 'modules', source, clean(source)),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => clone(chef, 'modules', source, { ...clean(source), project_id: 'missing', code: 'NO' }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => clone(admin, 'modules', { ...source, version: 999 }, clean(source)),
    (e) => e.status === 409,
  );
});
test('API documents : authentification, CSRF, téléchargement exact et aperçu privé', async () => {
  const session = await fetch(base + '/session');
  let cookie = session.headers.get('set-cookie').split(';')[0];
  let { csrf } = await session.json();
  const logged = await fetch(base + '/login', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ email: 'admin@test.fr', password }),
  });
  assert.equal(logged.status, 200);
  cookie = logged.headers.get('set-cookie').split(';')[0];
  csrf = (await logged.json()).csrf;
  const headers = { cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf };
  const route = base + `/projects/${project.id}/documents`;
  assert.equal((await fetch(route)).status, 401);
  assert.equal(
    (
      await fetch(route, {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    403,
  );
  const created = await fetch(route, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filename: 'rapport été.pdf',
      base64: pdf.toString('base64'),
      request_id: randomUUID(),
    }),
  });
  assert.equal(created.status, 201);
  const doc = await created.json();
  const download = await fetch(base + `/documents/${doc.id}/content`, { headers });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
  const preview = await fetch(base + `/documents/${doc.id}/content?preview=1`, { headers });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-disposition'), /^inline/);
  assert.match(preview.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(base + `/documents/${doc.id}/content`)).status, 401);
  const listed = await (await fetch(route, { headers })).json();
  assert.equal(listed[0].author, 'Admin');
  assert.equal(listed[0].content, undefined);
  assert.equal(
    (
      await fetch(base + `/documents/${doc.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: 'Titre', version: 1 }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + `/documents/${doc.id}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ version: 2 }),
      })
    ).status,
    200,
  );
  assert.equal((await fetch(base + `/documents/${doc.id}/content`, { headers })).status, 404);
  await fetch(base + '/logout', { method: 'POST', headers });
});
