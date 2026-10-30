// What the Editing waveform's end arrows do. A press moves the view by one step (Settings: 15 to 30 s) with a short ease; holding it past
// `HOLD_DELAY_MS` scrolls continuously at one step a second, eased in, until released. Under reduced motion a press jumps and a hold repeats
// whole steps. The view is scrolled with `scrollTo`, so the selection (placed on the document clock) stays where it is.

/** A press held this long (ms) is a hold, not a click. */
export const HOLD_DELAY_MS = 350;
/** How long a single step takes to arrive (ms). */
export const EASE_MS = 200;
/** A hold reaches full speed after this long (ms). */
const RAMP_MS = 250;
/** Under reduced motion a hold takes a whole step this often (ms). */
const REPEAT_MS = 500;

export interface HoldScrollDeps {
  /** The view now: where it starts, how long it is, and the whole length (seconds). */
  view: () => { start: number; len: number; total: number };
  scrollTo: (start: number) => void;
  /** The step in seconds, read at each press so a change in Settings applies at once. */
  step: () => number;
  reducedMotion: () => boolean;
  /** Calls the callback on every animation frame until the returned function is called. */
  subscribe: (cb: (nowMs: number) => void) => () => void;
}

export interface HoldScroll {
  press: (dir: 1 | -1) => void;
  /** The pointer went up: a step if it was a click, the end of the scroll if it was a hold. */
  release: () => void;
  /** The pointer left or the button went away: stops with no step. */
  cancel: () => void;
  /** One step with no pointer (a key press on the button). */
  step: (dir: 1 | -1) => void;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;

export function createHoldScroll(deps: HoldScrollDeps): HoldScroll {
  let pressed: 1 | -1 | 0 = 0;
  let holding = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  // Where a glide is heading, so a second press during it adds to the first; null when nothing glides.
  let target: number | null = null;
  let pos = 0;

  const max = (): number => {
    const v = deps.view();
    return Math.max(0, v.total - v.len);
  };
  const clamp = (s: number): number => Math.min(max(), Math.max(0, s));
  const move = (s: number): void => {
    pos = clamp(s);
    deps.scrollTo(pos);
  };
  const stopMotion = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    if (repeat !== null) clearInterval(repeat);
    repeat = null;
    target = null;
  };

  function step(dir: 1 | -1): void {
    const from = unsubscribe && target !== null ? pos : deps.view().start;
    const base = unsubscribe && target !== null ? target : from;
    const to = clamp(base + dir * deps.step());
    stopMotion();
    if (deps.reducedMotion() || to === from) {
      move(to);
      return;
    }
    target = to;
    pos = from;
    let t0: number | null = null;
    unsubscribe = deps.subscribe((now) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / EASE_MS);
      move(from + (to - from) * easeOut(t));
      if (t >= 1) stopMotion();
    });
  }

  function startHold(dir: 1 | -1): void {
    holding = true;
    stopMotion();
    if (deps.reducedMotion()) {
      const once = (): void => {
        const before = deps.view().start;
        const to = clamp(before + dir * deps.step());
        move(to);
        if (to === before) stopMotion();
      };
      once();
      repeat = setInterval(once, REPEAT_MS);
      return;
    }
    pos = deps.view().start;
    let t0: number | null = null;
    let last: number | null = null;
    unsubscribe = deps.subscribe((now) => {
      t0 ??= now;
      const dt = last === null ? 0 : now - last;
      last = now;
      const speed = easeIn(Math.min(1, (now - t0) / RAMP_MS)) * deps.step();
      move(pos + (dir * speed * dt) / 1000);
      if (pos <= 0 || pos >= max()) stopMotion();
    });
  }

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    press(dir) {
      clearTimer();
      pressed = dir;
      holding = false;
      timer = setTimeout(() => {
        timer = null;
        if (pressed) startHold(pressed);
      }, HOLD_DELAY_MS);
    },
    release() {
      clearTimer();
      const dir = pressed;
      pressed = 0;
      if (holding) {
        holding = false;
        stopMotion();
      } else if (dir) {
        step(dir);
      }
    },
    cancel() {
      clearTimer();
      pressed = 0;
      holding = false;
      stopMotion();
    },
    step,
  };
}
