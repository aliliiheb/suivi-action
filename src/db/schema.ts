/**
 * PROGRESS — Drizzle SQLite schema (spec §50–§53).
 *
 * Conventions:
 *  - Primary keys are ULID strings (§51), generated in the repository layer.
 *  - Timestamps are integer epoch-milliseconds (UTC). Display/locale formatting
 *    happens in the UI via date-fns; storage stays tz-agnostic (§49).
 *  - `createdAt` / `updatedAt` on every important entity; `completedAt`,
 *    `archivedAt`, `deletedAt` added where the lifecycle needs them (§52).
 *  - `deletedAt` implements soft-delete / trash (§43); queries filter it out.
 *  - Foreign keys + indexes are declared for the access paths the app actually
 *    uses, for performance at thousands of rows (§62).
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Reusable epoch-ms timestamp column helper. */
const ts = (name: string) => integer(name, { mode: 'number' });

// ── Profile & Settings (§5, §68) ─────────────────────────────────────────────

export const profile = sqliteTable('profile', {
  id: text('id').primaryKey(),
  name: text('name'),
  avatarPath: text('avatar_path'),
  language: text('language').notNull().default('fr'),
  timezone: text('timezone'),
  weekStartsOn: integer('week_starts_on').notNull().default(1), // 0=Sun..6=Sat
  timeFormat: text('time_format').notNull().default('24h'), // '12h' | '24h'
  theme: text('theme').notNull().default('system'),
  workdayStartMin: integer('workday_start_min'), // minutes from midnight
  workdayEndMin: integer('workday_end_min'),
  dailyFocusGoalMin: integer('daily_focus_goal_min').notNull().default(120),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/** Free-form key/value app settings (JSON-encoded values). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
  updatedAt: ts('updated_at').notNull(),
});

// ── Life areas (§6) ──────────────────────────────────────────────────────────

export const lifeAreas = sqliteTable(
  'life_areas',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    archivedAt: ts('archived_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byOrder: index('life_areas_order_idx').on(t.sortOrder),
    byDeleted: index('life_areas_deleted_idx').on(t.deletedAt),
  }),
);

// ── Goals (§7, §8) ─────────────────────────────────────────────────────────

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    areaId: text('area_id').references(() => lifeAreas.id),
    startDate: ts('start_date'),
    deadline: ts('deadline'),
    priority: text('priority').notNull().default('p3'),
    status: text('status').notNull().default('draft'),
    color: text('color'),
    icon: text('icon'),
    notes: text('notes'),
    progressMethod: text('progress_method').notNull().default('tasks'),
    goalType: text('goal_type').notNull().default('custom'),
    // numeric method fields (§8B)
    currentValue: real('current_value'),
    targetValue: real('target_value'),
    unit: text('unit'),
    // cached computed progress (recomputed by the engine, §13)
    progress: real('progress').notNull().default(0),
    // manual method value (§8C)
    manualProgress: real('manual_progress'),
    estimatedLoadMin: integer('estimated_load_min'),
    investedMin: integer('invested_min').notNull().default(0),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    completedAt: ts('completed_at'),
    archivedAt: ts('archived_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byArea: index('goals_area_idx').on(t.areaId),
    byStatus: index('goals_status_idx').on(t.status),
    byDeadline: index('goals_deadline_idx').on(t.deadline),
    byDeleted: index('goals_deleted_idx').on(t.deletedAt),
  }),
);

/** Hybrid progress weights for a goal (§8D); one row per dimension. */
export const goalMetrics = sqliteTable(
  'goal_metrics',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    target: real('target').notNull(),
    current: real('current').notNull().default(0),
    weight: real('weight').notNull(),
    source: text('source').notNull().default('manual'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (table) => ({ byGoalKey: uniqueIndex('goal_metrics_key_idx').on(table.goalId, table.key) }),
);

/** Hybrid progress weights for a goal (§8D); one row per dimension. */
export const goalHybridComponents = sqliteTable(
  'goal_hybrid_components',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'steps' | 'numeric' | 'habits'
    weight: real('weight').notNull(), // percent; set totals 100
  },
  (t) => ({ byGoal: index('goal_hybrid_goal_idx').on(t.goalId) }),
);

// ── Steps & Projects (§9) ────────────────────────────────────────────────────

export const goalSteps = sqliteTable(
  'goal_steps',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('planned'),
    startDate: ts('start_date'),
    deadline: ts('deadline'),
    weight: real('weight').notNull().default(1),
    progress: real('progress').notNull().default(0),
    investedMin: integer('invested_min').notNull().default(0),
    notes: text('notes'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    completedAt: ts('completed_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byGoal: index('goal_steps_goal_idx').on(t.goalId),
    byOrder: index('goal_steps_order_idx').on(t.goalId, t.sortOrder),
  }),
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('planned'),
    startDate: ts('start_date'),
    deadline: ts('deadline'),
    weight: real('weight').notNull().default(1),
    progress: real('progress').notNull().default(0),
    investedMin: integer('invested_min').notNull().default(0),
    notes: text('notes'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    completedAt: ts('completed_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byGoal: index('projects_goal_idx').on(t.goalId),
    byStatus: index('projects_status_idx').on(t.status),
  }),
);

// ── Tasks & Subtasks (§10, §11, §24) ─────────────────────────────────────────

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    stepId: text('step_id').references(() => goalSteps.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    priority: text('priority').notNull().default('p3'),
    status: text('status').notNull().default('inbox'),
    // §24: planned date and deadline are distinct concepts.
    plannedDate: ts('planned_date'),
    deadline: ts('deadline'),
    estimatedMin: integer('estimated_min'),
    spentMin: integer('spent_min').notNull().default(0),
    weight: real('weight').notNull().default(1),
    recurrenceRule: text('recurrence_rule'), // RFC5545-ish, optional (§10)
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    completedAt: ts('completed_at'),
    archivedAt: ts('archived_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byGoal: index('tasks_goal_idx').on(t.goalId),
    byStep: index('tasks_step_idx').on(t.stepId),
    byProject: index('tasks_project_idx').on(t.projectId),
    byStatus: index('tasks_status_idx').on(t.status),
    byPlanned: index('tasks_planned_idx').on(t.plannedDate),
    byDeadline: index('tasks_deadline_idx').on(t.deadline),
    byDeleted: index('tasks_deleted_idx').on(t.deletedAt),
  }),
);

export const subtasks = sqliteTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => ({ byTask: index('subtasks_task_idx').on(t.taskId, t.sortOrder) }),
);

// ── Tags (§10) ───────────────────────────────────────────────────────────────

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: ts('created_at').notNull(),
});

export const taskTags = sqliteTable(
  'task_tags',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({ byTask: index('task_tags_task_idx').on(t.taskId) }),
);

// ── Habits & logs (§21, §22) ─────────────────────────────────────────────────

export const habits = sqliteTable(
  'habits',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    areaId: text('area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    tracking: text('tracking').notNull().default('boolean'),
    targetValue: real('target_value'),
    unit: text('unit'),
    frequency: text('frequency').notNull().default('daily'), // daily|weekly|custom
    daysOfWeek: text('days_of_week'), // JSON array of 0..6 for custom
    preferredTimeMin: integer('preferred_time_min'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    archivedAt: ts('archived_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    byArea: index('habits_area_idx').on(t.areaId),
    byActive: index('habits_active_idx').on(t.active),
  }),
);

export const habitLogs = sqliteTable(
  'habit_logs',
  {
    id: text('id').primaryKey(),
    habitId: text('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD' local day key
    value: real('value').notNull().default(1), // count/duration; 1 for boolean done
    note: text('note'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byHabitDate: index('habit_logs_habit_date_idx').on(t.habitId, t.date),
    byDate: index('habit_logs_date_idx').on(t.date),
  }),
);

// ── Focus sessions (§18) ─────────────────────────────────────────────────────

export const focusSessions = sqliteTable(
  'focus_sessions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    stepId: text('step_id').references(() => goalSteps.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    areaId: text('area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // local day key 'YYYY-MM-DD'
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    durationMin: integer('duration_min').notNull().default(0),
    pausedMin: integer('paused_min').notNull().default(0),
    comment: text('comment'),
    entryType: text('entry_type').notNull().default('automatic'),
    state: text('state').notNull().default('stopped'),
    elapsedMs: real('elapsed_ms').notNull().default(0),
    pausedMs: real('paused_ms').notNull().default(0),
    lastTickAt: ts('last_tick_at').notNull().default(0),
    targetMin: integer('target_min'),
    recovered: integer('recovered', { mode: 'boolean' }).notNull().default(false),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byDate: index('focus_date_idx').on(t.date),
    byGoal: index('focus_goal_idx').on(t.goalId),
    byTask: index('focus_task_idx').on(t.taskId),
    byArea: index('focus_area_idx').on(t.areaId),
  }),
);

// ── Daily plan & priorities (§15, §16) ───────────────────────────────────────

export const dailyPlans = sqliteTable(
  'daily_plans',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull().unique(), // 'YYYY-MM-DD'
    plannedMin: integer('planned_min').notNull().default(0),
    capacityMin: integer('capacity_min').notNull().default(480),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({ byDate: index('daily_plans_date_idx').on(t.date) }),
);

export const dailyPriorities = sqliteTable(
  'daily_priorities',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(), // 1..3 (Top 3, §16)
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byDate: index('daily_priorities_date_idx').on(t.date, t.rank),
    byTask: uniqueIndex('daily_priority_task_idx').on(t.date, t.taskId),
    byRank: uniqueIndex('daily_priority_rank_idx').on(t.date, t.rank),
  }),
);

// ── Progress snapshots (§28) ─────────────────────────────────────────────────

export const goalProgressSnapshots = sqliteTable(
  'goal_progress_snapshots',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    progress: real('progress').notNull(),
    investedMin: integer('invested_min').notNull().default(0),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({ byGoalDate: index('snapshots_goal_date_idx').on(t.goalId, t.date) }),
);

// ── Reviews (§30, §31) ───────────────────────────────────────────────────────

export const weeklyReviews = sqliteTable('weekly_reviews', {
  id: text('id').primaryKey(),
  weekStart: text('week_start').notNull().unique(), // 'YYYY-MM-DD' (Monday)
  wentWell: text('went_well'),
  blocked: text('blocked'),
  toImprove: text('to_improve'),
  nextPriorities: text('next_priorities'),
  metricsJson: text('metrics_json'), // computed snapshot at review time
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const monthlyReviews = sqliteTable('monthly_reviews', {
  id: text('id').primaryKey(),
  month: text('month').notNull().unique(), // 'YYYY-MM'
  notes: text('notes'),
  metricsJson: text('metrics_json'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// ── Notes / progression journal (§32) ────────────────────────────────────────

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({ byGoal: index('notes_goal_idx').on(t.goalId, t.createdAt) }),
);

// ── Achievements (§36) ───────────────────────────────────────────────────────

export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(), // stable identifier of the achievement
  unlockedAt: ts('unlocked_at'),
  progress: real('progress').notNull().default(0),
});

// ── Audit history (§44) ──────────────────────────────────────────────────────

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    entity: text('entity').notNull(), // 'goal' | 'task' | ...
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(), // 'completed' | 'progress_changed' | ...
    detailJson: text('detail_json'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({ byEntity: index('audit_entity_idx').on(t.entity, t.entityId) }),
);
