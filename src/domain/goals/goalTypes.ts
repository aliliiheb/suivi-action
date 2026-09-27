export const GOAL_TYPES = [
  'custom',
  'quran',
  'sport',
  'study',
  'reading',
  'language',
  'creation',
  'memorization',
  'solidarity',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export interface MetricDefinition {
  key: string;
  unit: string;
  integer: boolean;
  required: boolean;
  focus?: boolean;
}
const metric = (
  key: string,
  unit: string,
  integer = true,
  required = false,
  focus = false,
): MetricDefinition => ({ key, unit, integer, required, focus });
export const GOAL_METRICS: Record<GoalType, MetricDefinition[]> = {
  custom: [],
  quran: [metric('quran_ayat', 'ayat', true, true), metric('quran_reviews', 'reviews')],
  sport: [metric('sport_sessions', 'sessions', true, true), metric('sport_km', 'km', false)],
  study: [
    metric('study_hours', 'hours', false, true, true),
    metric('study_chapters', 'chapters'),
    metric('study_exercises', 'exercises'),
  ],
  reading: [metric('reading_pages', 'pages', true, true), metric('reading_books', 'books')],
  language: [
    metric('language_words', 'words', true, true),
    metric('language_conversations', 'conversations'),
    metric('language_hours', 'hours', false, false, true),
  ],
  creation: [
    metric('creation_outputs', 'outputs', true, true),
    metric('creation_hours', 'hours', false, false, true),
  ],
  memorization: [
    metric('memorization_items', 'items', true, true),
    metric('memorization_reviews', 'reviews'),
  ],
  solidarity: [
    metric('solidarity_actions', 'actions', true, true),
    metric('solidarity_hours', 'hours', false, false, true),
  ],
};

export interface MetricInput {
  key: string;
  target: number;
  current: number;
  /** Accepted only for compatibility with older backups; progression is an equal average. */
  weight?: number;
  source: 'manual' | 'focus';
}
export class GoalValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
  }
}

export function validateMetrics(type: GoalType, values: MetricInput[]): void {
  const definitions = GOAL_METRICS[type];
  if (!definitions) throw new GoalValidationError('type', 'invalid');
  if (type === 'custom') {
    if (values.length) throw new GoalValidationError('metrics', 'invalid');
    return;
  }
  if (!values.length || new Set(values.map((value) => value.key)).size !== values.length)
    throw new GoalValidationError('metrics', 'required');
  for (const definition of definitions)
    if (definition.required && !values.some((value) => value.key === definition.key))
      throw new GoalValidationError(definition.key, 'required');
  for (const value of values) {
    const definition = definitions.find((definition) => definition.key === value.key);
    if (!definition) throw new GoalValidationError(value.key, 'invalid');
    if (
      !Number.isFinite(value.target) ||
      value.target <= 0 ||
      (definition.integer && !Number.isSafeInteger(value.target))
    )
      throw new GoalValidationError(
        `${value.key}.target`,
        definition.integer ? 'positiveInteger' : 'positive',
      );
    if (
      !Number.isFinite(value.current) ||
      value.current < 0 ||
      (definition.integer && !Number.isSafeInteger(value.current))
    )
      throw new GoalValidationError(
        `${value.key}.current`,
        definition.integer ? 'nonnegativeInteger' : 'nonnegative',
      );
    if (
      value.weight !== undefined &&
      (!Number.isFinite(value.weight) || value.weight <= 0 || value.weight > 100)
    )
      throw new GoalValidationError(`${value.key}.weight`, 'positive');
    if (
      !['manual', 'focus'].includes(value.source) ||
      (value.source === 'focus' && !definition.focus)
    )
      throw new GoalValidationError(`${value.key}.source`, 'invalid');
  }
}

/** Ratios are capped separately so extra kilometres cannot replace missing sessions. */
export function metricProgress(values: Pick<MetricInput, 'current' | 'target'>[]): number {
  if (!values.length) return 0;
  return (
    (values.reduce(
      (sum, value) =>
        sum + Math.min(1, Math.max(0, value.target > 0 ? value.current / value.target : 0)),
      0,
    ) /
      values.length) *
    100
  );
}
