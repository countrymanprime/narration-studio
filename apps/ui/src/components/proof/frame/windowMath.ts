/** The window lengths the zoom buttons step through, in seconds. The last step is the whole chapter. */
const WINDOW_LENGTHS = [30, 60, 120, 300] as const;

/** The shortest window, in seconds (or the whole chapter when it is shorter). */
export const MIN_WINDOW = WINDOW_LENGTHS[0];

/** The window a chapter opens with (mock `winLen: 60`), or the whole chapter when it is shorter. */
export const FIRST_WINDOW = WINDOW_LENGTHS[1];

export type TimeWindow = { start: number; len: number };

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** The steps for a chapter of `total` seconds: each length shorter than the chapter, then the chapter itself. */
export function zoomSteps(total: number): number[] {
  if (total <= 0) return [];
  return [...WINDOW_LENGTHS.filter((length) => length < total), total];
}

/** The window clamped to the chapter: never shorter than `MIN_WINDOW` (or the chapter), never past either end. */
function clampWindow(window: TimeWindow, total: number): TimeWindow {
  if (total <= 0) return { start: 0, len: 0 };
  const len = clamp(window.len, Math.min(MIN_WINDOW, total), total);
  return { start: clamp(window.start, 0, total - len), len };
}

/** The next zoom step in a direction (1 is longer, -1 is shorter) from a length that may lie between steps. Null at either end. */
export function stepLength(len: number, dir: 1 | -1, total: number): number | null {
  const steps = zoomSteps(total);
  const next = dir > 0 ? steps.find((step) => step > len + 1e-6) : [...steps].reverse().find((step) => step < len - 1e-6);
  return next ?? null;
}

/** Zoom one step, keeping the window's centre where the chapter allows. Null at the end of the steps. */
export function zoomWindow(window: TimeWindow, dir: 1 | -1, total: number): TimeWindow | null {
  const len = stepLength(window.len, dir, total);
  if (len == null) return null;
  return clampWindow({ start: window.start + window.len / 2 - len / 2, len }, total);
}

/** The window moved so its centre is at `centre`, kept inside the chapter. */
export function centreWindow(window: TimeWindow, centre: number, total: number): TimeWindow {
  return clampWindow({ start: centre - window.len / 2, len: window.len }, total);
}

/** Centre the window on `sec` when it lies outside; the same window when it is inside. */
export function followSecond(window: TimeWindow, sec: number, total: number): TimeWindow {
  return sec >= window.start && sec <= window.start + window.len ? window : centreWindow(window, sec, total);
}

/** Drag one edge to a time. The other edge stays; the length keeps `MIN_WINDOW` and the window stays inside the chapter. */
export function resizeWindow(window: TimeWindow, edge: 'start' | 'end', to: number, total: number): TimeWindow {
  const end = window.start + window.len;
  const min = Math.min(MIN_WINDOW, total);
  if (edge === 'start') {
    const start = clamp(to, 0, end - min);
    return { start, len: end - start };
  }
  const stop = clamp(to, window.start + min, total);
  return { start: window.start, len: stop - window.start };
}

/** Arrow-key nudge of the whole window: a tenth of its length, a whole length with Shift. */
export function nudgeWindow(window: TimeWindow, dir: 1 | -1, total: number, big = false): TimeWindow {
  const step = (big ? window.len : window.len / 10) * dir;
  return clampWindow({ start: window.start + step, len: window.len }, total);
}

/** Arrow-key step of one edge: 5 seconds, 30 with Shift. */
export const edgeStep = (big: boolean): number => (big ? 30 : 5);

/** The clock text for a second count: `m:ss`, or `h:mm:ss` from an hour. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
