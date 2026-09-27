import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia(query).matches;

/** Shared visual preference; it never affects application state or data. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
