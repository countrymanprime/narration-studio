import { useCallback, useState } from 'react';

/**
 * Whether motion should stop: Windows asked for reduced motion, or `<html data-motion="reduce">` is set, and the public demo's
 * "Play animations" switch (`<html data-motion="play">`) is not on. The same conditions turn off every `motion-ok:` utility
 * (styles.css), so code that moves things itself must ask this.
 */
export function reducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'play') return false;
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Settings → Appearance & keys → Motion: follow Windows, or reduce motion in this app whatever Windows says. */
export type MotionPreference = 'system' | 'reduce';

// Kept by this browser window, as the theme is (theme/theme.ts); index.html applies it before first paint.
export const MOTION_STORAGE_KEY = 'narration-ui-motion';

// The public demo's "Play animations" switch (DemoBanner): a visitor whose device asks for reduced motion can still see the app move. Its own
// key, so Settings -> Motion and the real app are untouched; the demo build alone reads it (`VITE_DEMO`, as index.html's inline script does).
export const PLAY_MOTION_STORAGE_KEY = 'narration-ui-demo-play-motion';

/** Whether this is the public demo, the only build where the Play animations switch exists. Read per call so a test can stub the env. */
function playSwitchAvailable(): boolean {
  return import.meta.env.VITE_DEMO === '1';
}

// The choice made in this window, so it holds until the page reloads when there is no storage to keep it (the demo inside the site's sandboxed
// window frame, or full storage).
let playThisWindow = false;

/** Whether the demo visitor switched Play animations on in this browser. Always false outside the demo. */
export function readStoredPlay(): boolean {
  if (!playSwitchAvailable()) return false;
  try {
    return localStorage.getItem(PLAY_MOTION_STORAGE_KEY) === '1' || playThisWindow;
  } catch {
    return playThisWindow;
  }
}

export function readStoredMotion(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'reduce' ? 'reduce' : 'system';
  } catch {
    return 'system';
  }
}

/**
 * `reduce` sets `<html data-motion="reduce">`; Follow Windows removes it, so only `prefers-reduced-motion` decides. In the demo, the
 * Play animations switch, when on, wins over both: it sets `data-motion="play"`, which keeps motion on whatever the device or Settings ask.
 */
export function applyMotion(preference: MotionPreference): void {
  if (readStoredPlay()) document.documentElement.dataset.motion = 'play';
  else if (preference === 'reduce') document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

/** The demo's Play animations switch: keeps the choice for this browser and applies it at once. Off goes back to the Motion setting. */
export function setPlayAnimations(on: boolean): void {
  if (!playSwitchAvailable()) return;
  playThisWindow = on;
  try {
    if (on) localStorage.setItem(PLAY_MOTION_STORAGE_KEY, '1');
    else localStorage.removeItem(PLAY_MOTION_STORAGE_KEY);
  } catch {
    // Storage unavailable: the choice holds for this window only.
  }
  applyMotion(readStoredMotion());
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
