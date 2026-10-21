// Local isolated UI verification. Never connects to production data.
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
const user = { id: 'mission-qa-admin', name: 'Admin QA', role: 'ADMIN', active: true };
const password = 'QA-missions-local-2026';
await db.query('INSERT INTO plan_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)', [
  user.id,
  user.name,
  'qa@missions.test',
  user.role,
  await bcrypt.hash(password, 4),
]);
const make = (kind, data) =>
  exclusive(db, user.id, (tx, u) => mutate(tx, u, kind, null, data, null, 'create'));
const client = await make('clients', { code: 'FMS', name: 'FMS TUNISIE', contact: '' });
const project = await make('projects', {
  code: 'P1',
  name: 'Projet principal',
  description: 'Plan de maintenance',
  client_id: client.id,
  manager_id: user.id,
  members: [user.id],
  planned_start: '2026-01-01',
  planned_end: '2026-12-31',
});
const { id: _pid, version: _pv, ...projectData } = project;
const second = await make('projects', { ...projectData, code: 'P2', name: 'Projet secondaire' });
const module = await make('modules', {
  code: 'M1',
  name: 'Maintenance',
  description: 'Module existant',
  project_id: project.id,
});
const action = await make('actions', {
  code: 'A1',
  description: 'Inspection existante',
  objective: 'Qualité',
  module_id: module.id,
  pilot_id: user.id,
  status: 'En cours',
  progress: 40,
  planned_start: '2026-01-01',
  planned_end: '2026-12-31',
  mission_number: 'ANCIEN-42',
  location: 'FSP ALGERIE',
});
const origin = 'http://127.0.0.1:3908';
const app = createApp(db, {
  secret: 'qa-missions-local-secret-over-thirty-two',
  origin,
  production: false,
  staticDir: path.resolve('dist'),
});
const server = app.listen(3908, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const output = path.resolve('docs/plans-missions-review');
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(origin + '/plans');
  await page.getByLabel('Adresse électronique', { exact: true }).fill('qa@missions.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await page
    .getByRole('button', { name: /Inspection existante/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Modifier l’action', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Modifier une action' });
  await parent.getByLabel('Description de l’action').fill('Inspection brouillon conservé');
  await parent.getByRole('button', { name: 'Créer une mission', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Créer une mission' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel('Description de l’action')).toHaveValue(
    'Inspection brouillon conservé',
  );
  await parent.getByRole('button', { name: 'Créer une mission', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Créer une mission' });
  await dialog.getByLabel('N° Mission', { exact: true }).fill('QA-MIS-001');
  await dialog.getByLabel('Intitulé de la mission').fill('Audit de maintenance');
  await dialog
    .getByLabel('Description détaillée')
    .fill('Mission créée depuis une action, sans perdre le brouillon.');
  await dialog.getByLabel('Date de début prévue').fill('2026-01-01');
  await dialog.getByLabel('Date de fin prévue').fill('2026-12-31');
  await dialog.getByLabel('Emplacement', { exact: true }).selectOption('FSP ALGERIE');
  await dialog.getByRole('button', { name: 'Enregistrer la mission' }).click();
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel('Description de l’action')).toHaveValue(
    'Inspection brouillon conservé',
  );
  await expect(parent.getByLabel('N° Mission', { exact: true })).not.toHaveValue('');
  await parent.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Inspection brouillon conservé', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'QA-MIS-001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QA-MIS-001', exact: true })).toBeVisible();
  let state = await snapshot(db, user);
  const first = state.missions.find((m) => m.number === 'QA-MIS-001');
  const actionAfter = state.actions.find((a) => a.id === action.id);
  assert.equal(actionAfter.mission_id, first.id);
  assert.equal(actionAfter.mission_number, 'ANCIEN-42');
  assert.equal(actionAfter.progress, 40);
  await page.getByLabel('Type d’élément').selectOption('modules');
  await page.getByLabel('Élément à associer').selectOption(module.id);
  await page.getByRole('button', { name: 'Associer / réaffecter' }).click();
  await expect(page.getByRole('button', { name: 'Dissocier', exact: true })).toHaveCount(2);
  await page.getByLabel('Type d’élément').selectOption('projects');
  await page.getByLabel('Élément à associer').selectOption(second.id);
  await page.getByRole('button', { name: 'Associer / réaffecter' }).click();
  await expect(page.getByRole('button', { name: 'Dissocier', exact: true })).toHaveCount(3);
  const docs = page.getByRole('region', { name: 'Documents joints' });
  await docs
    .locator('input[type=file]')
    .setInputFiles({
      name: 'mission.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    });
  await expect(docs.getByText('1 document(s) ajouté(s).')).toBeVisible();
  await page.getByLabel('Ajouter un commentaire').fill('Point de suivi mission');
  await page.getByRole('button', { name: 'Publier le commentaire' }).click();
  await expect(page.getByText('Point de suivi mission', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifier la mission', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('N° Mission', { exact: true }).fill('QA-MIS-002');
  await dialog.getByLabel('Statut', { exact: true }).selectOption('Terminée');
  await dialog.getByLabel('Début réel').fill('2026-01-01');
  await dialog.getByLabel('Fin réelle').fill('2026-10-21');
  await dialog.getByRole('button', { name: 'Enregistrer la mission' }).click();
  await expect(page.getByRole('heading', { name: 'QA-MIS-002', exact: true })).toBeVisible();
  state = await snapshot(db, user);
  assert.deepEqual(
    state.actions.find((a) => a.id === action.id),
    actionAfter,
  );
  for (const [name, width, height] of [
    ['ordinateur', 1440, 1000],
    ['tablette', 834, 1112],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('heading', { name: 'QA-MIS-002', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `Débordement ${name}`,
    );
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    const report = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      path.join(output, `${name}-accessibility.json`),
      JSON.stringify(report.violations, null, 2),
    );
    assert.deepEqual(
      report.violations.map((v) => v.id),
      [],
      `Accessibilité ${name}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Dupliquer la mission', exact: true }).click();
  dialog = page.getByRole('dialog');
  const generated = await dialog.getByLabel('N° Mission', { exact: true }).inputValue();
  assert.notEqual(generated, 'QA-MIS-002');
  await expect(dialog.getByLabel('Statut', { exact: true })).toHaveValue('Planifiée');
  await expect(dialog.getByLabel('Fin réelle')).toHaveValue('');
  await dialog.getByLabel('N° Mission', { exact: true }).fill('QA-MIS-003');
  await dialog.getByLabel('Projet associé').selectOption(second.id);
  await dialog.getByRole('button', { name: 'Enregistrer la copie' }).click();
  await expect(page.getByRole('heading', { name: 'QA-MIS-003', exact: true })).toBeVisible();
  await expect(docs.locator('li')).toHaveCount(0);
  state = await snapshot(db, user);
  const copy = state.missions.find((m) => m.number === 'QA-MIS-003');
  assert.equal(copy.status, 'Planifiée');
  assert.equal(state.actions.filter((a) => a.mission_id === copy.id).length, 0);
  await page.getByLabel('Type d’élément').selectOption('actions');
  await page.getByLabel('Élément à associer').selectOption(action.id);
  await page.getByRole('button', { name: 'Associer / réaffecter' }).click();
  await expect(page.getByRole('button', { name: 'Dissocier', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Dissocier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dissocier', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archiver la mission', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Réactiver la mission', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Réactiver la mission', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Archiver la mission', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Précédente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QA-MIS-002', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suivante', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QA-MIS-003', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Liste des missions', exact: true }).click();
  await page.getByLabel('Rechercher une mission').fill('QA-MIS-002');
  await expect(page.getByRole('link', { name: 'QA-MIS-002', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'QA-MIS-003', exact: true })).toHaveCount(0);
  await page.getByLabel('Rechercher une mission').fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile-dashboard.png'), fullPage: true });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    audit.violations.map((v) => v.id),
    [],
    'Dashboard accessible',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Missions : création imbriquée, annulation sans perte, sélection, navigation directe et précédente/suivante, associations/réaffectations, documents, commentaires, renommage indépendant, copie, archivage, recherche et trois tailles écran validés. Axe AA : aucun défaut.',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await db.close();
}
