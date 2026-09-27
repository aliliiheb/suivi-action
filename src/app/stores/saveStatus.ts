import { create } from 'zustand';

/** Global autosave status surfaced in the header (spec §57). */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusState {
  status: SaveStatus;
  setStatus: (status: SaveStatus) => void;
}

export const useSaveStatus = create<SaveStatusState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));
