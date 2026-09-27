import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@/domain/enums';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/** Persisted theme preference: light / dark / system (spec §46). */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'progress-theme' },
  ),
);
