import { connectDatabase } from './db.mjs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { mutate } from './service.mjs';
import { parse, schemas } from './rules.mjs';
const db = await connectDatabase();
try {
  const demo = process.argv.includes('--demo');
  if (
    demo &&
    (!process.env.PLANS_DEMO_DIR ||
      process.env.DATABASE_URL ||
      process.env.NODE_ENV === 'production')
  )
    throw new Error('La démonstration exige PLANS_DEMO_DIR et interdit DATABASE_URL / production.');
  const { email, password } = parse(schemas.users, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: demo ? 'Amel Ben Salem' : 'Administrateur',
    role: 'ADMIN',
    active: true,
  });
  if (!password) throw new Error('ADMIN_PASSWORD est obligatoire.');
  if (process.env.NODE_ENV === 'production' && /REPLACE|CHANGE_ME/.test(password))
    throw new Error('Remplacez le mot de passe d’exemple avant de créer le compte.');
  await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM plan_write_lock WHERE id=1 FOR UPDATE');
    if ((await tx.query('SELECT id FROM plan_users LIMIT 1')).rows.length)
      throw new Error('Base déjà initialisée. Aucune donnée modifiée.');
    const admin = {
      id: randomUUID(),
      name: demo ? 'Amel Ben Salem' : 'Administrateur',
      email,
      role: 'ADMIN',
      active: true,
      version: 1,
    };
    await tx.query(
      'INSERT INTO plan_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',
      [admin.id, admin.name, email, 'ADMIN', await bcrypt.hash(password, 12)],
    );
    if (!demo) return;
    const chef = await mutate(
      tx,
      admin,
      'users',
      null,
      { name: 'Karim Mansour', email: 'karim@example.test', role: 'CHEF', active: true, password },
      null,
      'create',
    );
    const pilot = await mutate(
      tx,
      admin,
      'users',
      null,
      { name: 'Lina Trabelsi', email: 'lina@example.test', role: 'PILOTE', active: true, password },
      null,
      'create',
    );
    const today = new Date();
    const day = (offset) =>
      new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const client = await mutate(
      tx,
      admin,
      'clients',
      null,
      { code: 'NOVA', name: 'Nova Industrie', contact: 'contact@nova.example.test · Tunis' },
      null,
      'create',
    );
    const p = await mutate(
      tx,
      admin,
      'projects',
      null,
      {
        code: 'EXC-2026',
        name: 'Excellence opérationnelle',
        client_id: client.id,
        manager_id: chef.id,
        members: [chef.id, pilot.id, admin.id],
        description: 'Améliorer la qualité de service et fiabiliser les processus de production.',
        planned_start: day(-30),
        planned_end: day(60),
      },
      null,
      'create',
    );
    const m = await mutate(
      tx,
      admin,
      'modules',
      null,
      {
        code: 'QUAL',
        name: 'Qualité & processus',
        description: 'Standardiser les pratiques et suivre les résultats.',
        project_id: p.id,
      },
      null,
      'create',
    );
    const m2 = await mutate(
      tx,
      admin,
      'modules',
      null,
      {
        code: 'FORM',
        name: 'Formation des équipes',
        description: 'Accompagner les équipes sur les nouveaux standards.',
        project_id: p.id,
      },
      null,
      'create',
    );
    const specs = [
      ['Cartographier les processus clés', 'Terminée', 100, -4],
      ['Réduire le taux de non-conformité', 'En cours', 65, 7],
      ['Valider le nouveau protocole qualité', 'Bloquée', 30, -2],
      ['Former les référents de production', 'En cours', 45, 3],
      ['Déployer le tableau de suivi', 'À faire', 0, 14],
      ['Organiser la revue mensuelle', 'À faire', 0, 5],
    ];
    for (const [index, [description, status, progress, end]] of specs.entries()) {
      await mutate(
        tx,
        admin,
        'actions',
        null,
        {
          code: `ACT-00${index + 1}`,
          module_id: index > 2 ? m2.id : m.id,
          pilot_id: index % 2 ? pilot.id : chef.id,
          description,
          objective:
            index === 1
              ? 'Atteindre 98 % de produits conformes'
              : 'Livrable validé par l’équipe projet',
          planned_start: day(-15),
          planned_end: day(end),
          actual_start: progress ? day(-12) : '',
          actual_end: status === 'Terminée' ? day(-5) : '',
          status,
          progress,
          cause: status === 'Bloquée' ? 'Validation fournisseur en attente.' : '',
          target: index === 1 ? 98 : null,
          achieved: index === 1 ? 94 : null,
          unit: index === 1 ? '%' : '',
          corrective: [],
        },
        null,
        'create',
      );
    }
  });
  console.log('Initialisation terminée. Les comptes de démonstration utilisent ADMIN_PASSWORD.');
} finally {
  await db.close();
}
