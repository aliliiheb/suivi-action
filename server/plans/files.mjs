import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  HeadingLevel,
} from 'docx';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { fail, statuses } from './rules.mjs';
export const columns = {
  id: 'Identifiant action',
  version: 'Version',
  module_id: 'Identifiant module',
  code: 'Code',
  description: 'Description',
  objective: 'Objectif',
  pilot_id: 'Identifiant pilote',
  planned_start: 'Début prévu',
  planned_end: 'Fin prévue',
  actual_start: 'Début réel',
  actual_end: 'Fin réelle',
  status: 'Statut',
  progress: 'Avancement %',
  target: 'Cible',
  achieved: 'Réalisé',
  unit: 'Unité',
  cause: 'Cause du retard',
  corrective: 'Actions correctives JSON',
  deadline_2: '2e échéance',
  deadline_3: '3e échéance',
};
const values = (a) =>
  Object.keys(columns).map((k) => (k === 'corrective' ? JSON.stringify(a[k] || []) : (a[k] ?? '')));
const dateFields = [
  'planned_start',
  'planned_end',
  'actual_start',
  'actual_end',
  'deadline_2',
  'deadline_3',
];
const frenchDate = (value) => (value ? String(value).split('-').reverse().join('/') : '');
export async function exportFile(format, project, actions, modules, users) {
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PROGRESS';
    const info = wb.addWorksheet('Projet');
    info.addRows([
      ['Plan d’actions', project.name],
      ['Code', project.code],
      ['Identifiant projet', project.id],
      ['Version projet', project.version],
      ['Début prévu', frenchDate(project.planned_start)],
      ['Fin prévue', frenchDate(project.planned_end)],
      ['Description', project.description],
      [
        'Convention',
        'Dates JJ/MM/AAAA (ou AAAA-MM-JJ) ; écart = réalisé − cible ; avancement distinct de l’objectif.',
      ],
      [
        'Réimportation',
        'Conservez les identifiants et les versions. Aucune absence ne supprime une action.',
      ],
      ['Objectif qualitatif', 'Laissez cible, réalisé et unité vides.'],
      ['Action terminée', '100 %, début réel et fin réelle obligatoires.'],
    ]);
    info.columns = [{ width: 28 }, { width: 100 }];
    info.getColumn(2).alignment = { wrapText: true };
    const sheet = wb.addWorksheet('Actions', {
      views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }],
    });
    sheet.columns = [
      ...Object.entries(columns).map(([key, header]) => ({
        key,
        header,
        width: ['description', 'objective', 'cause', 'corrective'].includes(key)
          ? 55
          : key === 'id' || key.endsWith('_id')
            ? 39
            : 20,
      })),
      { key: 'comments', header: 'Commentaires (lecture seule)', width: 60 },
    ];
    actions.forEach((a) => {
      const row = sheet.addRow([...values(a), a.comments || '']);
      for (const field of dateFields) {
        if (a[field]) {
          row.getCell(field).value = new Date(a[field] + 'T00:00:00Z');
          row.getCell(field).numFmt = 'dd/mm/yyyy';
        }
      }
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174D43' } };
    sheet.eachRow((row, n) => {
      row.alignment = { vertical: 'top', wrapText: true };
      if (n > 1) {
        row.getCell(12).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${statuses.join(',')}"`],
        };
        row.getCell(13).dataValidation = {
          type: 'decimal',
          operator: 'between',
          formulae: [0, 100],
        };
      }
    });
    const directory = wb.addWorksheet('Références');
    directory.addRows([
      ['Type', 'Identifiant', 'Code ou nom', 'Adresse électronique'],
      ...modules.map((m) => ['Module', m.id, m.code + ' — ' + m.name, '']),
      ...users.map((u) => ['Responsable', u.id, u.name, u.email || '']),
    ]);
    directory.columns = [{ width: 20 }, { width: 40 }, { width: 55 }, { width: 40 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  if (format !== 'docx') fail(422, 'Format attendu : xlsx ou docx.');
  const para = (text, bold = false) =>
    new Paragraph({
      children: [new TextRun({ text: String(text), bold, size: 20 })],
      spacing: { after: 80 },
    });
  const table = (rows) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        ([k, v], i) =>
          new TableRow({
            cantSplit: String(v).length < 600,
            tableHeader: i === 0,
            children: [
              new TableCell({
                width: { size: 28, type: WidthType.PERCENTAGE },
                shading: { fill: 'EEF3F1' },
                children: [para(k, true)],
              }),
              new TableCell({
                width: { size: 72, type: WidthType.PERCENTAGE },
                children: [para(v)],
              }),
            ],
          }),
      ),
    });
  const children = [
    new Paragraph({ text: 'Plan d’actions', heading: HeadingLevel.TITLE }),
    para(`${project.code} — ${project.name}`, true),
    para(`Projet ${project.id} · version ${project.version}`),
    para(`Période : ${frenchDate(project.planned_start)} au ${frenchDate(project.planned_end)}`),
    para(project.description || ''),
    para(
      'Modifiez les valeurs des tableaux en conservant les libellés, identifiants et versions. Dates : JJ/MM/AAAA ou AAAA-MM-JJ. Écart = réalisé − cible. Pour un objectif qualitatif, laissez les mesures vides. Les commentaires sont en lecture seule.',
    ),
    new Paragraph({ text: 'Références', heading: HeadingLevel.HEADING_1 }),
    ...modules.map((m) => para(`${m.code} — ${m.name} : ${m.id}`)),
    ...users.map((u) => para(`${u.name} : ${u.id}`)),
  ];
  for (const a of actions)
    children.push(
      new Paragraph({
        text: `${a.code} — ${a.description}`,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
      table([
        ['Champ', 'Valeur'],
        ...Object.entries(columns).map(([key, label], i) => [
          label,
          dateFields.includes(key) ? frenchDate(a[key]) : String(values(a)[i]),
        ]),
        ['Commentaires (lecture seule)', a.comments || ''],
      ]),
    );
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
          children,
        },
      ],
    }),
  );
}
function checkArchive(buffer, format) {
  if (buffer.length > 5 * 1024 * 1024) fail(413, 'Le fichier dépasse 5 Mo.');
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    fail(422, 'Fichier Office illisible.');
  }
  const entries = zip.getEntries();
  if (entries.length > 3000 || entries.reduce((s, e) => s + e.header.size, 0) > 30 * 1024 * 1024)
    fail(413, 'Le contenu décompressé dépasse la limite de 30 Mo.');
  if (
    !zip.getEntry(format === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml') ||
    entries.some((e) => /vbaProject|embeddings\//i.test(e.entryName))
  )
    fail(422, 'Document Office non compatible ou contenant du contenu incorporé.');
  return zip;
}
const array = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
function textNodes(value) {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .map(([key, v]) =>
      key === 'w:t'
        ? array(v)
            .map((x) => (typeof x === 'object' ? (x['#text'] ?? '') : x))
            .join('')
        : array(v).map(textNodes).join(''),
    )
    .join('');
}
export async function readFileRows(filename, buffer) {
  const format = filename.toLowerCase().split('.').pop();
  if (!['xlsx', 'docx'].includes(format)) fail(422, 'Formats autorisés : .xlsx et .docx.');
  const zip = checkArchive(buffer, format);
  let matrix = [];
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet('Actions') || wb.worksheets[0];
    if (!sheet) fail(422, 'Le classeur ne contient aucune feuille.');
    if (sheet.rowCount > 1001 || sheet.columnCount > 80)
      fail(413, 'Maximum : 1 000 actions et 80 colonnes.');
    sheet.eachRow((row) => {
      matrix.push(
        Array.from({ length: sheet.columnCount }, (_, i) => {
          const cell = row.getCell(i + 1);
          const v = cell.value;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === 'number' && /(^|[^\\])%/.test(cell.numFmt || ''))
            return String(Number((v * 100).toPrecision(15)));
          if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v))
            fail(
              422,
              'Les cellules de formule ne sont pas importées. Collez des valeurs dans une copie du fichier.',
            );
          return cell.text;
        }),
      );
    });
  } else {
    const xml = zip.readAsText('word/document.xml');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail(422, 'Entités XML non autorisées.');
    const document = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml);
    const tables = array(document['w:document']?.['w:body']?.['w:tbl']).map((t) =>
      array(t['w:tr']).map((r) => array(r['w:tc']).map(textNodes)),
    );
    const standard = tables.filter((t) => t[0]?.[0] === 'Champ' && t[0]?.[1] === 'Valeur');
    if (standard.length) {
      const labels = Object.values(columns).filter((label) =>
        standard.some((table) => table.some((row) => row[0] === label)),
      );
      matrix = [
        labels,
        ...standard.map((t) => labels.map((label) => t.find((r) => r[0] === label)?.[1] ?? '')),
      ];
    } else if (tables.length) {
      matrix = tables[0];
      for (const t of tables.slice(1)) {
        if (JSON.stringify(t[0]) !== JSON.stringify(matrix[0]))
          fail(422, 'Les tableaux doivent avoir les mêmes en-têtes. Utilisez le modèle standard.');
        matrix.push(...t.slice(1));
      }
    } else
      fail(
        422,
        'Aucun tableau structuré compatible. Les documents Word libres ne sont pas pris en charge. Téléchargez le modèle standard.',
      );
  }
  const [headers, ...rows] = matrix;
  if (
    !headers?.length ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !h.trim())
  )
    fail(422, 'Les en-têtes doivent être non vides et uniques.');
  if (!rows.length) fail(422, 'Le fichier ne contient aucune action.');
  if (
    rows.length > 1000 ||
    headers.length > 80 ||
    rows.some((r) => r.some((c) => String(c).length > 20000))
  )
    fail(413, 'Le fichier dépasse les limites de lignes ou de texte.');
  return {
    headers,
    rows: rows.filter((r) => r.some((v) => String(v).trim())),
    mapping: Object.fromEntries(
      Object.entries(columns).map(([key, label]) => [key, headers.includes(label) ? label : '']),
    ),
  };
}
