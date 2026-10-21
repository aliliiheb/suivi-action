import express from 'express';
import session from 'express-session';
import { Passport } from 'passport';
import { Strategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { fail, parse } from './rules.mjs';
import { snapshot, userById, exclusive, mutate, audit, authorize } from './service.mjs';
import { exportFile, readFileRows, columns } from './files.mjs';
import { previewImport, commitImport } from './imports.mjs';
import { duplicate } from './duplication.mjs';
import { missionAccess } from './documents.mjs';
import {
  addDocument,
  changeDocument,
  getDocument,
  projectAccess,
  documentColumns,
} from './documents.mjs';
class SqlSessions extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, cb) {
    this.db
      .query('SELECT data FROM plan_sessions WHERE sid=$1 AND expires>now()', [sid])
      .then((r) => cb(null, r.rows[0]?.data || null), cb);
  }
  set(sid, data, cb = () => {}) {
    this.db
      .query(
        'INSERT INTO plan_sessions(sid,data,expires) VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET data=$2,expires=$3',
        [
          sid,
          JSON.stringify(data),
          new Date(data.cookie.expires || Date.now() + 28800000).toISOString(),
        ],
      )
      .then(() => cb(), cb);
  }
  destroy(sid, cb = () => {}) {
    this.db.query('DELETE FROM plan_sessions WHERE sid=$1', [sid]).then(() => cb(), cb);
  }
  touch(sid, data, cb = () => {}) {
    this.set(sid, data, cb);
  }
}
export function createApp(
  db,
  {
    secret = process.env.SESSION_SECRET,
    origin = process.env.APP_ORIGIN || 'http://localhost:1420',
    production = process.env.NODE_ENV === 'production',
    staticDir,
  } = {},
) {
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET doit contenir au moins 32 caractères aléatoires.');
  if (production && (/REPLACE|CHANGE_ME/.test(secret) || !origin.startsWith('https://')))
    throw new Error('En production : secret aléatoire et APP_ORIGIN HTTPS obligatoires.');
  const app = express();
  const passport = new Passport();
  if (production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    '/api/plans',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Trop de requêtes. Réessayez dans une minute.' },
    }),
  );
  app.use(express.json({ limit: '8mb' }));
  app.use(
    session({
      name: 'progress.sid',
      secret,
      store: new SqlSessions(db),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  passport.use(
    new Strategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const row = (
          await db.query('SELECT * FROM plan_users WHERE email=$1', [
            String(email).toLowerCase().trim(),
          ])
        ).rows[0];
        const valid = await bcrypt.compare(
          String(password),
          row?.password_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.0SLykAOaNZSA/EaHyEBAYCRJ.yVcMWu',
        );
        done(null, row?.active && valid ? { id: row.id } : false);
      } catch (e) {
        done(e);
      }
    }),
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await userById(db, id);
      done(null, user?.active ? user : false);
    } catch (e) {
      done(e);
    }
  });
  app.use(passport.initialize());
  app.use(passport.session());
  const api = express.Router();
  app.use('/api/plans', api);
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.get('/session', (req, res) => {
    req.session.csrf ||= randomBytes(32).toString('hex');
    res.json({ user: req.user || null, csrf: req.session.csrf, columns });
  });
  api.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') && req.get('origin') !== origin)
        return next(Object.assign(new Error('Origine non autorisée.'), { status: 403 }));
      if (!req.session.csrf || req.get('x-csrf-token') !== req.session.csrf)
        return next(
          Object.assign(new Error('Session de formulaire expirée. Rechargez la page.'), {
            status: 403,
          }),
        );
    }
    next();
  });
  api.post(
    '/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 15,
      message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    }),
    (req, res, next) => {
      passport.authenticate('local', (error, user) => {
        if (error) return next(error);
        if (!user)
          return res
            .status(401)
            .json({ message: 'Adresse électronique ou mot de passe incorrect.' });
        req.logIn(user, (error) => {
          if (error) return next(error);
          req.session.csrf = randomBytes(32).toString('hex');
          res.json({ ok: true, csrf: req.session.csrf });
        });
      })(req, res, next);
    },
  );
  api.use((req, _res, next) => {
    if (!req.user) return next(Object.assign(new Error('Connexion requise.'), { status: 401 }));
    next();
  });
  api.post('/logout', (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie('progress.sid');
        res.json({ ok: true });
      });
    });
  });
  api.get('/state', async (req, res) => res.json(await snapshot(db, req.user)));
  api.post('/missions/:id/links', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, async (tx, u) => {
        const body = parse(
          z
            .object({
              kind: z.enum(['projects', 'modules', 'actions']),
              entity_id: z.string().min(1),
              version: z.number().int(),
              detach: z.boolean().default(false),
            })
            .strict(),
          req.body,
        );
        const state = await snapshot(tx, u);
        const mission = state.missions.find((m) => m.id === req.params.id);
        if (!mission) fail(404, 'Mission inaccessible.');
        authorize(state, 'missions', mission, 'update');
        const entity = state[body.kind].find((e) => e.id === body.entity_id);
        if (!entity) fail(404, 'Élément inaccessible.');
        if (body.detach && entity.mission_id !== mission.id)
          fail(409, 'L’association a changé. Actualisez la fiche.');
        const { id, version: _version, ...data } = entity;
        return mutate(
          tx,
          u,
          body.kind,
          id,
          { ...data, mission_id: body.detach ? '' : mission.id },
          body.version,
        );
      }),
    ),
  );
  api.get('/missions/:id/documents', async (req, res) => {
    await missionAccess(db, req.user, req.params.id);
    res.json(
      (
        await db.query(
          `SELECT ${documentColumns} FROM plan_documents d JOIN plan_users u ON u.id=d.uploaded_by WHERE mission_id=$1 ORDER BY at DESC,id`,
          [req.params.id],
        )
      ).rows,
    );
  });
  api.post('/missions/:id/documents', async (req, res) =>
    res
      .status(201)
      .json(
        await exclusive(db, req.user.id, (tx, u) =>
          addDocument(tx, u, req.params.id, req.body, 'missions'),
        ),
      ),
  );
  api.get('/missions/:id/history', async (req, res) => {
    await missionAccess(db, req.user, req.params.id);
    res.json(
      (
        await db.query(
          'SELECT a.*,u.name AS author FROM plan_audit a JOIN plan_users u ON u.id=a.actor_id WHERE entity_id=$1 ORDER BY at DESC,id',
          [req.params.id],
        )
      ).rows,
    );
  });
  api.post('/missions/:id/comments', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, async (tx, u) => {
        const m = await missionAccess(tx, u, req.params.id);
        if (m.archived) fail(422, 'Mission archivée.');
        const content = parse(z.string().trim().min(1).max(4000), req.body.content);
        await audit(tx, u, m.id, null, 'Commentaire', null, { content });
        return { ok: true };
      }),
    ),
  );
  api.get('/projects/:id/documents', async (req, res) => {
    await projectAccess(db, req.user, req.params.id);
    res.json(
      (
        await db.query(
          `SELECT ${documentColumns} FROM plan_documents d JOIN plan_users u ON u.id=d.uploaded_by WHERE project_id=$1 ORDER BY at DESC,id`,
          [req.params.id],
        )
      ).rows,
    );
  });
  api.post('/projects/:id/documents', async (req, res) =>
    res
      .status(201)
      .json(
        await exclusive(db, req.user.id, (tx, user) =>
          addDocument(tx, user, req.params.id, req.body),
        ),
      ),
  );
  api.get('/documents/:id/content', async (req, res) => {
    const row = await getDocument(db, req.user, req.params.id);
    const content = (await db.query('SELECT content FROM plan_documents WHERE id=$1', [row.id]))
      .rows[0]?.content;
    if (!content) fail(404, 'Document supprimé.');
    const inline =
      req.query.preview === '1' &&
      (row.mime === 'application/pdf' || row.mime.startsWith('image/'));
    res.set('Content-Type', row.mime);
    res.set(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="document.${row.filename.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    );
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(Buffer.from(content));
  });
  api.put('/documents/:id', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, (tx, user) =>
        changeDocument(tx, user, req.params.id, req.body),
      ),
    ),
  );
  api.delete('/documents/:id', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, (tx, user) =>
        changeDocument(tx, user, req.params.id, req.body, true),
      ),
    ),
  );
  api.post('/:kind/:id/duplicate', async (req, res) =>
    res
      .status(201)
      .json(
        await exclusive(db, req.user.id, (tx, user) =>
          duplicate(tx, user, req.params.kind, req.params.id, req.body),
        ),
      ),
  );
  api.get('/:kind/:id/provenance', async (req, res) => {
    if (!['projects', 'modules', 'actions', 'missions'].includes(req.params.kind))
      fail(404, 'Ressource inconnue.');
    const state = await snapshot(db, req.user);
    if (!state[req.params.kind].some((r) => r.id === req.params.id))
      fail(404, 'Fiche inaccessible.');
    const row = (
      await db.query(
        'SELECT d.kind,d.source_id,d.target_id,d.at,u.name AS author FROM plan_duplications d JOIN plan_users u ON u.id=d.actor_id WHERE d.target_id=$1 AND d.kind=$2',
        [req.params.id, req.params.kind],
      )
    ).rows[0];
    res.json(
      row
        ? { ...row, source_available: state[req.params.kind].some((r) => r.id === row.source_id) }
        : null,
    );
  });
  api.get('/actions/:id/history', async (req, res) => {
    const state = await snapshot(db, req.user);
    if (!state.actions.some((a) => a.id === req.params.id)) fail(404, 'Action inaccessible.');
    res.json(
      (
        await db.query(
          'SELECT a.*,u.name AS author FROM plan_audit a JOIN plan_users u ON u.id=a.actor_id WHERE entity_id=$1 ORDER BY at DESC,id',
          [req.params.id],
        )
      ).rows,
    );
  });
  api.post('/actions/:id/comments', async (req, res) => {
    const content = parse(z.string().trim().min(1).max(4000), req.body.content);
    const result = await exclusive(db, req.user.id, async (tx, user) => {
      const state = await snapshot(tx, user);
      const action = state.actions.find((a) => a.id === req.params.id);
      if (!action) fail(404, 'Action inaccessible.');
      authorize(state, 'actions', action, 'update');
      const mod = state.modules.find((m) => m.id === action.module_id);
      await audit(tx, user, action.id, mod.project_id, 'Commentaire', null, { content });
      return { ok: true };
    });
    res.json(result);
  });
  api.get('/projects/:id/export/:format', async (req, res) => {
    const state = await snapshot(db, req.user);
    const project = state.projects.find((p) => p.id === req.params.id);
    if (!project) fail(404, 'Projet inaccessible.');
    const modules = state.modules.filter((m) => m.project_id === project.id);
    const actions =
      req.query.template === '1'
        ? []
        : state.actions.filter((a) => modules.some((m) => m.id === a.module_id));
    // Templates contain one unsaved example, with no fabricated persistent identity.
    if (req.query.template === '1')
      actions.push({
        id: '',
        version: '',
        module_id: modules[0]?.id || '',
        code: 'NOUVELLE-ACTION',
        description: 'Décrire l’action',
        objective: 'Décrire le résultat attendu',
        pilot_id: project.manager_id,
        planned_start: project.planned_start,
        planned_end: project.planned_end,
        actual_start: '',
        actual_end: '',
        status: 'À faire',
        progress: 0,
        target: null,
        achieved: null,
        unit: '',
        cause: '',
        corrective: [],
      });
    const comments = (
      await db.query(
        "SELECT a.entity_id,a.at,a.after_data,u.name FROM plan_audit a JOIN plan_users u ON u.id=a.actor_id WHERE a.entity_id=ANY($1::text[]) AND a.operation='Commentaire' ORDER BY a.at",
        [actions.map((a) => a.id).filter(Boolean)],
      )
    ).rows;
    for (const action of actions)
      action.comments = comments
        .filter((c) => c.entity_id === action.id)
        .map(
          (c) =>
            `${new Date(c.at).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC · ${c.name} : ${c.after_data.content}`,
        )
        .join('\n');
    const buffer = await exportFile(
      req.params.format,
      project,
      actions,
      modules,
      state.users.filter((u) => project.members.includes(u.id)),
      {
        origin,
        missions: state.missions.filter(
          (m) =>
            m.project_id === project.id ||
            project.mission_id === m.id ||
            modules.some((mod) => mod.mission_id === m.id) ||
            actions.some((a) => a.mission_id === m.id),
        ),
      },
    );
    res.type(
      req.params.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.set(
      'Content-Disposition',
      `attachment; filename="plan-${project.id}.${req.params.format}"`,
    );
    res.send(buffer);
  });
  api.post('/imports/read', async (req, res) => {
    const input = parse(
      z.object({ filename: z.string().min(1).max(255), base64: z.string().max(7000000) }),
      req.body,
    );
    res.json(await readFileRows(input.filename, Buffer.from(input.base64, 'base64')));
  });
  api.post('/imports/preview', async (req, res) =>
    res.json(await exclusive(db, req.user.id, (tx, user) => previewImport(tx, user, req.body))),
  );
  api.post('/imports/:id/commit', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, (tx, user) =>
        commitImport(tx, user, req.params.id, req.body.decisions),
      ),
    ),
  );
  api.get('/imports', async (req, res) => {
    const state = await snapshot(db, req.user);
    res.json(
      (
        await db.query(
          "SELECT * FROM plan_imports WHERE (project_id=ANY($1::text[]) OR (project_id IS NULL AND $3='ADMIN')) AND (actor_id=$2 OR $3='ADMIN') ORDER BY at DESC LIMIT 100",
          [state.projects.map((p) => p.id), req.user.id, req.user.role],
        )
      ).rows,
    );
  });
  api.post('/:kind', async (req, res) =>
    res
      .status(201)
      .json(
        await exclusive(db, req.user.id, (tx, user) =>
          mutate(tx, user, req.params.kind, null, req.body.data, null, 'create'),
        ),
      ),
  );
  api.put('/:kind/:id', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, (tx, user) =>
        mutate(tx, user, req.params.kind, req.params.id, req.body.data, req.body.version),
      ),
    ),
  );
  api.delete('/:kind/:id', async (req, res) =>
    res.json(
      await exclusive(db, req.user.id, (tx, user) =>
        mutate(tx, user, req.params.kind, req.params.id, null, req.body.version, 'delete'),
      ),
    ),
  );
  api.use((_req, _res) => fail(404, 'Ressource inconnue.'));
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get(['/plans', '/plans/{*path}'], (_req, res) =>
      res.sendFile(path.join(staticDir, 'plans.html')),
    );
  }
  app.use((error, _req, res, _next) => {
    const status = error.status || (['23505', '23503'].includes(error.code) ? 409 : 500);
    const message =
      error.code === '23505'
        ? 'Ce code ou cette adresse existe déjà.'
        : error.code === '23503'
          ? 'Cet élément est utilisé. Retirez ou réattribuez ses dépendances.'
          : status === 500
            ? 'Erreur interne. Réessayez ou contactez votre administrateur.'
            : error.message;
    if (status === 500) console.error(error);
    res.status(status).json({ message, details: error.details });
  });
  return app;
}
