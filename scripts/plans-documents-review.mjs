// Isolated browser verification: in-memory database, no production credentials or data.
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../server/plans/db.mjs';
import { createApp } from '../server/plans/app.mjs';
import { mutate, exclusive, snapshot } from '../server/plans/service.mjs';
const db = await connectDatabase({ url: '', directory: ':memory:' });
const user = { id: 'qa-admin', name: 'Admin QA', role: 'ADMIN', active: true };
const password = 'Local-QA-only-2026';
await db.query('INSERT INTO plan_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)', [
  user.id,
  user.name,
  'qa@example.test',
  'ADMIN',
  await bcrypt.hash(password, 4),
]);
const make = (kind, data) =>
  exclusive(db, user.id, (tx, u) => mutate(tx, u, kind, null, data, null, 'create'));
const company = await make('clients', { code: 'FMS', name: 'FMS TUNISIE', contact: '' });
const company2 = await make('clients', { code: 'SBC', name: 'SBC ALGÉRIE', contact: '' });
const project = await make('projects', {
  code: 'P1',
  name: 'Projet source',
  description: 'Projet de vérification isolé',
  client_id: company.id,
  manager_id: user.id,
  members: [user.id],
  planned_start: '2026-01-01',
  planned_end: '2026-12-31',
});
const destination = await make('projects', {
  code: 'P2',
  name: 'Projet destination',
  description: '',
  client_id: company2.id,
  manager_id: user.id,
  members: [user.id],
  planned_start: '2026-01-01',
  planned_end: '2026-12-31',
});
const module = await make('modules', {
  code: 'M1',
  name: 'Module source',
  description: 'Maintenance',
  project_id: project.id,
});
const destinationModule = await make('modules', {
  code: 'M2',
  name: 'Module destination',
  description: '',
  project_id: destination.id,
});
const original = await make('actions', {
  code: 'A1',
  description: 'Audit maintenance',
  objective: 'Qualité',
  module_id: module.id,
  pilot_id: user.id,
  status: 'Terminée',
  progress: 100,
  planned_start: '2026-01-01',
  planned_end: '2026-02-01',
  actual_start: '2026-01-01',
  actual_end: '2026-01-31',
  location: 'FSP ALGERIE',
  corrective: [],
});
const output = path.resolve('docs/plans-documents-review');
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:3907';
const app = createApp(db, {
  secret: 'qa-local-session-secret-long-enough-2026',
  origin,
  production: false,
  staticDir: path.resolve('dist'),
});
const server = app.listen(3907, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(origin + '/plans');
  await page.getByLabel('Adresse électronique', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await page.getByRole('button', { name: /Projet source/ }).click();
  const docs = page.getByRole('region', { name: 'Documents joints' });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA6cAAAAASUVORK5CYII=',
    'base64',
  );
  await docs.locator('input[type=file]').setInputFiles([
    { name: 'rapport.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
    { name: 'photo.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(docs.getByText('2 document(s) ajouté(s).')).toBeVisible();
  await expect(docs.locator('.document-list > li')).toHaveCount(2);
  const photo = docs.locator('li').filter({ has: page.getByText('photo.png', { exact: true }) });
  await photo.getByRole('button', { name: 'Prévisualiser' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'photo.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer l’aperçu' }).click();
  await photo.getByRole('button', { name: 'Renommer' }).click();
  await photo.getByLabel('Titre affiché').fill('Photo du chantier');
  await photo.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(docs.getByText('Photo du chantier', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await docs.getByRole('link', { name: 'Télécharger' }).first().click();
  assert.ok((await download).suggestedFilename());
  for (const [name, width, height] of [
    ['ordinateur', 1440, 1000],
    ['tablette', 834, 1112],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await docs.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      'Débordement horizontal',
    );
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      path.join(output, `${name}-accessibility.json`),
      JSON.stringify(audit.violations, null, 2),
    );
    assert.deepEqual(
      audit.violations.map((v) => v.id),
      [],
      `Accessibilité ${name}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Dupliquer', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom / désignation').fill('Projet copie');
  await dialog.getByLabel('Client', { exact: true }).selectOption(company2.id);
  await dialog.getByLabel('Copier également les documents joints').check();
  await dialog.getByRole('button', { name: 'Enregistrer la copie' }).click();
  await expect(page.getByRole('heading', { name: 'Projet copie', exact: true })).toBeVisible();
  await expect(docs.locator('.document-list > li')).toHaveCount(2);
  await page.getByRole('link', { name: 'Consulter la fiche source' }).click();
  await expect(page.getByRole('heading', { name: 'Projet source', exact: true })).toBeVisible();
  await page
    .locator('.module-panel')
    .getByRole('button', { name: 'Dupliquer', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom / désignation').fill('Module copie');
  await dialog.getByLabel('Projet', { exact: true }).selectOption(destination.id);
  await dialog.getByLabel(/Copier également les actions/).check();
  await dialog.getByRole('button', { name: 'Enregistrer la copie' }).click();
  await expect(
    page.getByRole('heading', { name: 'Projet destination', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Module copie', exact: true })).toBeVisible();
  const sourceLink = page
    .locator('.module-panel')
    .filter({ has: page.getByRole('heading', { name: 'Module copie', exact: true }) })
    .getByRole('link', { name: 'Consulter la fiche source' });
  await sourceLink.click();
  await page.getByRole('button', { name: /Audit maintenance/ }).click();
  await page.getByRole('button', { name: 'Dupliquer l’action' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Module', { exact: true }).selectOption(destinationModule.id);
  await dialog.getByLabel('Description de l’action').fill('Audit copié');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile-duplication.png'), fullPage: true });
  const formAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    formAudit.violations.map((v) => v.id),
    [],
    'Accessibilité formulaire',
  );
  await dialog.getByRole('button', { name: 'Enregistrer la copie' }).click();
  await expect(page.getByRole('heading', { name: 'Audit copié', exact: true })).toBeVisible();
  let state = await snapshot(db, user);
  const copy = state.actions.find((a) => a.description === 'Audit copié');
  assert.equal(copy.module_id, destinationModule.id);
  assert.equal(copy.status, 'À faire');
  assert.equal(copy.progress, 0);
  assert.equal(copy.actual_end, '');
  assert.deepEqual(
    state.actions.find((a) => a.id === original.id),
    original,
  );
  await page.getByRole('button', { name: 'Modifier l’action' }).click();
  await page.getByLabel('Description de l’action').fill('Audit copié modifié');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Audit copié modifié', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Consulter la fiche source' }).click();
  await expect(page.getByRole('heading', { name: 'Audit maintenance', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('navigation').getByRole('button', { name: 'Projets', exact: true }).click();
  await page.getByRole('button', { name: /Projet copie/ }).click();
  await docs.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await expect(docs.locator('.document-list > li')).toHaveCount(1);
  assert.equal(
    (await db.query('SELECT id FROM plan_documents WHERE project_id=$1', [project.id])).rows.length,
    2,
  );
  state = await snapshot(db, user);
  assert.deepEqual(
    state.actions.find((a) => a.id === original.id),
    original,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Navigateur : documents multiples, téléchargement, aperçu, renommage, suppression, trois duplications, modification indépendante, FSP et trois tailles écran validés. Aucun défaut axe AA.',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await db.close();
}
