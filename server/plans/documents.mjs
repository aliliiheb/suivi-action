import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import AdmZip from 'adm-zip';
import { fail, parse } from './rules.mjs';
import { snapshot, authorize, audit } from './service.mjs';

export const MAX_FILE = 5 * 1024 * 1024;
const PROJECT_LIMIT = 50 * 1024 * 1024;
const TOTAL_LIMIT = 200 * 1024 * 1024;
const mimeTypes = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export const documentColumns =
  'd.id,d.project_id,d.mission_id,d.title,d.filename,d.mime,d.size,d.uploaded_by,d.at,d.version,u.name AS author';
export async function missionAccess(tx, user, id, write = false) {
  const state = await snapshot(tx, user);
  const mission = state.missions.find((m) => m.id === id);
  if (!mission) fail(404, 'Mission inaccessible.');
  if (write) {
    authorize(state, 'missions', mission, 'update');
    if (mission.archived) fail(422, 'Réactivez la mission avant de modifier ses documents.');
  }
  return mission;
}
export async function projectAccess(tx, user, id, write = false) {
  const state = await snapshot(tx, user);
  const project = state.projects.find((p) => p.id === id);
  if (!project) fail(404, 'Projet inaccessible.');
  if (write) authorize(state, 'projects', project, 'update');
  return project;
}
export function validateFile(filename, content) {
  const ext = filename.split('.').pop().toLowerCase();
  const mime = mimeTypes[ext];
  if (!mime || /[\x00-\x1f/\\]/.test(filename)) fail(422, 'Nom ou format de fichier non autorisé.');
  if (!content.length || content.length > MAX_FILE)
    fail(422, 'Chaque fichier doit contenir entre 1 octet et 5 Mo.');
  const hex = content.subarray(0, 8).toString('hex');
  let valid = false;
  if (ext === 'pdf') valid = content.subarray(0, 5).toString() === '%PDF-';
  if (['jpg', 'jpeg'].includes(ext)) valid = hex.startsWith('ffd8ff');
  if (ext === 'png') valid = hex === '89504e470d0a1a0a';
  if (ext === 'webp')
    valid =
      content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP';
  if (['doc', 'xls', 'ppt'].includes(ext)) valid = hex === 'd0cf11e0a1b11ae1';
  if (['docx', 'xlsx', 'pptx'].includes(ext)) {
    try {
      const entries = new AdmZip(content).getEntries();
      const root = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[ext];
      valid =
        entries.length <= 5000 &&
        entries.some((e) => e.entryName === '[Content_Types].xml') &&
        entries.some((e) => e.entryName.startsWith(root)) &&
        entries.reduce((n, e) => n + e.header.size, 0) <= 100 * 1024 * 1024;
    } catch {
      valid = false;
    }
  }
  if (!valid)
    fail(
      422,
      'Le contenu du fichier ne correspond pas au format annoncé ou le document est invalide.',
    );
  return mime;
}
export async function quota(tx, projectId, additional, owner = 'projects') {
  const column = owner === 'missions' ? 'mission_id' : 'project_id';
  const {
    rows: [row],
  } = await tx.query(
    `SELECT COALESCE(SUM(size),0) AS total, COALESCE(SUM(size) FILTER (WHERE ${column}=$1),0) AS project FROM plan_documents`,
    [projectId],
  );
  if (Number(row.project) + additional > PROJECT_LIMIT)
    fail(422, 'La limite de documents de cette fiche est de 50 Mo.');
  if (Number(row.total) + additional > TOTAL_LIMIT)
    fail(
      422,
      'La capacité totale des documents (200 Mo) est atteinte. Contactez votre administrateur.',
    );
}
export async function addDocument(tx, user, projectId, input, owner = 'projects') {
  await (owner === 'missions' ? missionAccess : projectAccess)(tx, user, projectId, true);
  const column = owner === 'missions' ? 'mission_id' : 'project_id';
  const data = parse(
    z
      .object({
        filename: z.string().min(1).max(255),
        base64: z.string().min(1).max(6990508),
        request_id: z.string().uuid(),
      })
      .strict(),
    input,
  );
  const content = Buffer.from(data.base64, 'base64');
  if (content.toString('base64') !== data.base64) fail(422, 'Encodage du fichier invalide.');
  const mime = validateFile(data.filename, content);
  const existing = (
    await tx.query(
      'SELECT id,project_id,mission_id,filename,content FROM plan_documents WHERE uploaded_by=$1 AND request_id=$2',
      [user.id, data.request_id],
    )
  ).rows[0];
  if (existing) {
    if (
      existing[column] !== projectId ||
      existing.filename !== data.filename ||
      !Buffer.from(existing.content).equals(content)
    )
      fail(409, 'Cette demande a déjà été utilisée pour un autre document.');
    return { id: existing.id };
  }
  await quota(tx, projectId, content.length, owner);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO plan_documents(id,${column},title,filename,mime,size,content,uploaded_by,request_id) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8)`,
    [id, projectId, data.filename, mime, content.length, content, user.id, data.request_id],
  );
  await audit(
    tx,
    user,
    owner === 'missions' ? projectId : id,
    owner === 'missions' ? null : projectId,
    'Ajout document',
    null,
    {
      document_id: id,
      filename: data.filename,
      size: content.length,
    },
  );
  return { id };
}
export async function getDocument(tx, user, id, write = false) {
  const row = (
    await tx.query(
      `SELECT ${documentColumns} FROM plan_documents d JOIN plan_users u ON u.id=d.uploaded_by WHERE d.id=$1`,
      [id],
    )
  ).rows[0];
  if (!row) fail(404, 'Document introuvable.');
  await (row.mission_id ? missionAccess : projectAccess)(
    tx,
    user,
    row.mission_id || row.project_id,
    write,
  );
  return row;
}
export async function changeDocument(tx, user, id, input, remove = false) {
  const row = await getDocument(tx, user, id, true);
  const data = parse(
    z
      .object({
        version: z.number().int(),
        ...(remove ? {} : { title: z.string().trim().min(1).max(255) }),
      })
      .strict(),
    input,
  );
  if (data.version !== row.version) fail(409, 'Le document a changé. Actualisez la liste.');
  if (remove) await tx.query('DELETE FROM plan_documents WHERE id=$1', [id]);
  else
    await tx.query('UPDATE plan_documents SET title=$1,version=version+1 WHERE id=$2', [
      data.title,
      id,
    ]);
  await audit(
    tx,
    user,
    row.mission_id || id,
    row.project_id,
    remove ? 'Suppression document' : 'Renommage document',
    row,
    remove ? null : { title: data.title },
  );
  return { ok: true };
}
export async function copyDocuments(tx, user, sourceId, targetId) {
  const rows = (
    await tx.query('SELECT id,size FROM plan_documents WHERE project_id=$1', [sourceId])
  ).rows;
  await quota(
    tx,
    targetId,
    rows.reduce((n, r) => n + r.size, 0),
  );
  for (const row of rows)
    await tx.query(
      'INSERT INTO plan_documents(id,project_id,title,filename,mime,size,content,uploaded_by,request_id) SELECT $1,$2,title,filename,mime,size,content,$3,$4 FROM plan_documents WHERE id=$5',
      [randomUUID(), targetId, user.id, randomUUID(), row.id],
    );
}
