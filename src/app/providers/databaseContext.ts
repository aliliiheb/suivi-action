import type { WorkspaceRepository } from '@/db/repositories/workspace';
import { createContext, useContext } from 'react';
import type { LearningRepository } from '@/db/repositories/learning';
import type { SpiritualRepository } from '@/db/repositories/spiritual';
import type { HabitRepository } from '@/db/repositories/habits';
import type { ReportsRepository } from '@/db/repositories/reports';
import type { ArchiveRepository } from '@/db/repositories/archive';
import type { LifeAreaRepository } from '@/db/repositories/lifeAreas';
import type { GoalRepository } from '@/db/repositories/goals';
import type { TaskRepository } from '@/db/repositories/tasks';
import type { StepRepository } from '@/db/repositories/steps';
import type { ProjectRepository } from '@/db/repositories/projects';
import type { SubtaskRepository } from '@/db/repositories/subtasks';
import type { ProgressService } from '@/db/services/progressService';
import type { PlanningRepository } from '@/db/repositories/planning';
import type { FocusRepository } from '@/db/repositories/focus';
export interface Repositories {
  workspace: WorkspaceRepository;
  spiritual: SpiritualRepository;
  learning: LearningRepository;
  archive: ArchiveRepository;
  reports: ReportsRepository;
  habits: HabitRepository;
  lifeAreas: LifeAreaRepository;
  goals: GoalRepository;
  tasks: TaskRepository;
  steps: StepRepository;
  projects: ProjectRepository;
  subtasks: SubtaskRepository;
  planning: PlanningRepository;
  focus: FocusRepository;
}

export interface DbContextValue {
  repos: Repositories;
  /** Central progression recompute/propagation service (§13, §87). */
  progress: ProgressService;
  /** Run a mutation, then persist, updating the global save status (§57). */
  commit: <T>(fn: () => Promise<T>) => Promise<T>;
}

export const DbContext = createContext<DbContextValue | null>(null);

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within <DatabaseProvider>');
  return ctx;
}
