import { fail } from './rules.mjs';

export function normalizeDate(value) {
  if (typeof value !== 'string') return value;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
}

export function normalizeNumber(value) {
  if (typeof value === 'number') return value;
  const text = String(value)
    .trim()
    .replace(/[\u00a0\u202f ]/g, '')
    .replace(/%$/, '')
    .replace(',', '.');
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

export function resolveReference(value, records, fields, label) {
  if (!value) return value;
  const direct = records.find((record) => record.id === value);
  if (direct) return direct.id;
  const normalized = String(value).trim().normalize('NFKC').toLocaleLowerCase('fr');
  const candidates = records.filter((record) =>
    fields.some(
      (field) =>
        String(record[field] || '')
          .trim()
          .normalize('NFKC')
          .toLocaleLowerCase('fr') === normalized,
    ),
  );
  if (candidates.length !== 1)
    fail(
      422,
      candidates.length
        ? `${label} ambigu : utilisez son identifiant stable dans la feuille Références.`
        : `${label} introuvable dans ce projet : ${value}.`,
    );
  return candidates[0].id;
}
