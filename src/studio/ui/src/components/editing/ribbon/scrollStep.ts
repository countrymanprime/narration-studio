// How far the Editing waveform's end arrows move the view: one step of 15 to 30 seconds, 20 until the narrator chooses. Kept by this browser
// window as the start tone and the theme are; storage can be missing or blocked, and then it reads as the default.

export const SCROLL_STEP_STORAGE_KEY = 'narration-ui-ribbon-scroll-step';
export const SCROLL_STEP_DEFAULT = 20;
export const SCROLL_STEP_MIN = 15;
export const SCROLL_STEP_MAX = 30;

/** A step in seconds, kept within the range Settings offers; anything that is not a number is the default. */
export function clampScrollStep(seconds: number): number {
  if (!Number.isFinite(seconds)) return SCROLL_STEP_DEFAULT;
  return Math.min(SCROLL_STEP_MAX, Math.max(SCROLL_STEP_MIN, Math.round(seconds)));
}

export function readScrollStep(): number {
  try {
    const raw = localStorage.getItem(SCROLL_STEP_STORAGE_KEY);
    return raw === null || raw.trim() === '' ? SCROLL_STEP_DEFAULT : clampScrollStep(Number(raw));
  } catch {
    return SCROLL_STEP_DEFAULT;
  }
}

export function writeScrollStep(seconds: number): void {
  try {
    localStorage.setItem(SCROLL_STEP_STORAGE_KEY, String(clampScrollStep(seconds)));
  } catch {
    // Storage unavailable: the choice holds for this window only.
  }
}
