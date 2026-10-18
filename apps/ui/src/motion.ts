import { useCallback, useState } from 'react';

/**
 * Whether motion should stop: Windows asked for reduced motion, or `<html data-motion="reduce">` is set. The same two
 * conditions turn off every `motion-ok:` utility (styles.css), so code that moves things itself must ask this.
 */
export function reducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Settings → Appearance & keys → Motion: follow Windows, or reduce motion in this app whatever Windows says. */
export type MotionPreference = 'system' | 'reduce';

// Kept by this browser window, as the theme is (theme/theme.ts); index.html applies it before first paint.
export const MOTION_STORAGE_KEY = 'narration-ui-motion';

export function readStoredMotion(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'reduce' ? 'reduce' : 'system';
  } catch {
    return 'system';
  }
}

/** `reduce` sets `<html data-motion="reduce">`; Follow Windows removes it, so only `prefers-reduced-motion` decides. */
export function applyMotion(preference: MotionPreference): void {
  if (preference === 'reduce') document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

/** The Motion choice and its setter, which applies it at once and keeps it for the next start. */
export function useMotionPreference(): [MotionPreference, (next: MotionPreference) => void] {
  const [preference, setPreference] = useState<MotionPreference>(readStoredMotion);
  const choose = useCallback((next: MotionPreference) => {
    applyMotion(next);
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice holds for this window only.
    }
    setPreference(next);
  }, []);
  return [preference, choose];
}
