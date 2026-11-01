import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHoldScroll, EASE_MS, HOLD_DELAY_MS, type HoldScrollDeps } from './holdScroll';

// A whole recording of 300 s, a window of 40 s starting at 100 s: room both ways for 15 to 30 s steps.
const TOTAL = 300;
const LEN = 40;

let frames: Set<(now: number) => void>;
let clock: number;
let start: number;
let steps: number;
let reduced: boolean;
let moves: number[];

function deps(): HoldScrollDeps {
  return {
    view: () => ({ start, len: LEN, total: TOTAL }),
    scrollTo: (s) => {
      start = Math.min(Math.max(s, 0), TOTAL - LEN);
      moves.push(start);
    },
    step: () => steps,
    reducedMotion: () => reduced,
    subscribe: (cb) => {
      frames.add(cb);
      return () => frames.delete(cb);
    },
  };
}
/** Runs animation frames every 16 ms for `ms`. */
function run(ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    clock += 16;
    vi.advanceTimersByTime(16);
    for (const cb of [...frames]) cb(clock);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Set();
  clock = 0;
  start = 100;
  steps = 20;
  reduced = false;
  moves = [];
});
afterEach(() => vi.useRealTimers());

describe('a press on a waveform arrow', () => {
  it('moves the window by exactly one step, not a window', () => {
    const s = createHoldScroll(deps());
    s.press(1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(120);
    s.press(-1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(100);
  });

  it('uses the step the narrator set, read at each press', () => {
    const s = createHoldScroll(deps());
    steps = 15;
    s.press(1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(115);
    steps = 30;
    s.press(1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(145);
  });

  it('eases to the step instead of jumping, and goes straight there under reduced motion', () => {
    const s = createHoldScroll(deps());
    s.press(1);
    s.release();
    run(48);
    expect(start).toBeGreaterThan(100);
    expect(start).toBeLessThan(120);
    run(EASE_MS);
    expect(start).toBe(120);
    expect(frames.size).toBe(0);

    reduced = true;
    s.press(1);
    s.release();
    expect(start).toBe(140);
    expect(frames.size).toBe(0);
  });

  it('stacks quick presses on the place the last one is heading', () => {
    const s = createHoldScroll(deps());
    s.press(1);
    s.release();
    run(48);
    s.press(1);
    s.release();
    run(EASE_MS * 2);
    expect(start).toBe(140);
  });

  it('stops at the start and the end of the recording', () => {
    const s = createHoldScroll(deps());
    start = 10;
    s.press(-1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(0);
    start = TOTAL - LEN - 5;
    s.press(1);
    s.release();
    run(EASE_MS + 50);
    expect(start).toBe(TOTAL - LEN);
  });

  it('a key press (a click with no pointer) steps once', () => {
    const s = createHoldScroll(deps());
    s.step(1);
    run(EASE_MS + 50);
    expect(start).toBe(120);
  });
});

describe('holding a waveform arrow', () => {
  it('does not move until the hold delay passes, then scrolls continuously at one step a second', () => {
    const s = createHoldScroll(deps());
    s.press(1);
    run(HOLD_DELAY_MS - 32);
    expect(moves).toEqual([]);
    run(64);
    run(1000);
    const before = start;
    run(1000);
    expect(start - before).toBeCloseTo(20, 0);
    // Smooth: many small moves, none larger than a fifth of the step.
    const gaps = moves.slice(1).map((m, i) => m - moves[i]!);
    expect(gaps.length).toBeGreaterThan(30);
    expect(Math.max(...gaps)).toBeLessThan(4);
    s.release();
  });

  it('follows the step setting', () => {
    steps = 30;
    const s = createHoldScroll(deps());
    s.press(1);
    run(HOLD_DELAY_MS + 1500);
    const before = start;
    run(1000);
    expect(start - before).toBeCloseTo(30, 0);
    s.release();
  });

  it('stops cleanly on release, and the release is not also a step', () => {
    const s = createHoldScroll(deps());
    s.press(-1);
    run(HOLD_DELAY_MS + 800);
    s.release();
    const at = start;
    run(1000);
    expect(start).toBe(at);
    expect(frames.size).toBe(0);
  });

  it('ends at the bound of the recording and stays there', () => {
    const s = createHoldScroll(deps());
    start = 30;
    s.press(-1);
    run(HOLD_DELAY_MS + 3000);
    expect(start).toBe(0);
    expect(frames.size).toBe(0);
    s.release();
    expect(start).toBe(0);
  });

  it('under reduced motion repeats whole steps, not a glide', () => {
    reduced = true;
    const s = createHoldScroll(deps());
    s.press(1);
    run(HOLD_DELAY_MS + 16);
    expect(start).toBe(120);
    run(2100);
    s.release();
    expect(moves.every((m) => (m - 100) % 20 === 0)).toBe(true);
    expect(start).toBeGreaterThanOrEqual(160);
  });

  it('cancel (the pointer left or the button went away) stops it without a step', () => {
    const s = createHoldScroll(deps());
    s.press(1);
    run(100);
    s.cancel();
    run(1000);
    expect(start).toBe(100);
  });
});
