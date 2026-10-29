import { describe, expect, it } from 'vitest';
import { audioTail, type Envelope } from './audioTail';
import { heardWindow, WORD_TAIL_SECONDS } from './runway';
import type { ChapterDoc, DocItem } from './doc';

const STEP = 0.02;

/** An envelope from `[seconds, level]` breakpoints, joined by straight lines, sampled every STEP from `from` to `to`. */
const shape = (from: number, to: number, points: [number, number][]): Envelope => {
  const level: number[] = [];
  for (let t = from; t < to - 1e-9; t += STEP) {
    const at = points.findIndex(([x]) => x >= t);
    if (at <= 0) level.push(at === 0 ? points[0][1] : points[points.length - 1][1]);
    else {
      const [x0, y0] = points[at - 1];
      const [x1, y1] = points[at];
      level.push(y0 + ((t - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return { start: from, step: STEP, level };
};

// "statues" as the owner hears it: the recognizer ends the word at 10.50 s, in the middle of the "u"; the sound goes on through the "u" and an
// "s" that thins out and is gone at about 10.80 s. These levels are the shape of that word (a loud "stat", a weaker "u", a hiss), not a recording.
const STATUES: [number, number][] = [
  [10.0, 0.0],
  [10.04, 0.7],
  [10.3, 0.8],
  [10.46, 0.65],
  [10.5, 0.5],
  [10.6, 0.45],
  [10.64, 0.2],
  [10.72, 0.12],
  [10.8, 0.03],
  [10.82, 0.005],
];
/** The last moment before `until` that the word is above 5% of its own peak: the measured end of its sound. */
const soundEnd = (env: Envelope, peak: number, until: number): number => {
  let last = env.start;
  env.level.forEach((v, i) => {
    if (env.start + i * env.step < until && v > 0.05 * peak) last = env.start + (i + 1) * env.step;
  });
  return last;
};

describe('audioTail', () => {
  const pause = shape(10.0, 12.0, [...STATUES, [11.2, 0.005], [11.24, 0.6], [11.5, 0.7]]);

  it('carries "statues" to the end of its sound, not the recognizer\'s early end', () => {
    const measured = soundEnd(pause, 0.8, 11.2);
    expect(measured).toBeGreaterThan(10.7);
    const got = audioTail(pause, 10.0, 10.5, 11.18)!;
    expect(got).toBeGreaterThanOrEqual(measured - STEP);
    expect(got).toBeLessThanOrEqual(measured + 0.1);
    // The fixed tail it replaces stopped at 10.70: "stat" and half the "u".
    expect(got).toBeGreaterThan(10.5 + WORD_TAIL_SECONDS);
  });

  it('stops at the valley when the next word follows with no pause', () => {
    const touching = shape(10.0, 12.0, [...STATUES.slice(0, -2), [10.78, 0.06], [10.82, 0.04], [10.9, 0.5], [11.1, 0.7]]);
    const got = audioTail(touching, 10.0, 10.5, 10.95, { start: 10.9, end: 11.4 })!;
    expect(got).toBeGreaterThanOrEqual(10.76);
    expect(got).toBeLessThanOrEqual(10.86);
  });

  // The old rule took the first dip it saw for the end: the closure of the "t" inside "statues" (quiet for 60 ms, then the "ues"), or an "s" 25 dB under the vowel.
  it('does not take a closure inside the word for its end', () => {
    const closure = shape(10.0, 12.0, [
      [10.0, 0],
      [10.04, 0.7],
      [10.3, 0.8],
      [10.4, 0.01],
      [10.46, 0.01],
      [10.5, 0.4],
      [10.6, 0.4],
      [10.7, 0.05],
      [10.8, 0.03],
      [10.9, 0.004],
      [11.4, 0.004],
    ]);
    const got = audioTail(closure, 10.0, 10.42, 11.18)!;
    expect(got).toBeGreaterThan(10.8);
  });

  it('plays out a weak final "s" that sits well under the vowel', () => {
    const hiss = shape(10.0, 12.0, [
      [10.0, 0],
      [10.04, 0.8],
      [10.4, 0.7],
      [10.45, 0.04],
      [10.75, 0.035],
      [10.8, 0.003],
      [11.4, 0.003],
    ]);
    const got = audioTail(hiss, 10.0, 10.42, 11.18)!;
    expect(got).toBeGreaterThan(10.75);
  });

  it('knows the room from the whole chapter when the window holds no pause', () => {
    const noisy = shape(10.0, 12.0, [
      [10.0, 0],
      [10.04, 0.7],
      [10.4, 0.6],
      [10.5, 0.03],
      [12.0, 0.03],
    ]);
    expect(audioTail({ ...noisy, floor: 0.03 }, 10.0, 10.42, 11.18)).toBeLessThan(10.8);
    expect(audioTail(noisy, 10.0, 10.42, 11.18)).toBe(11.18);
  });

  it('never goes past the limit it is given', () => {
    expect(audioTail(pause, 10.0, 10.5, 10.6)).toBeLessThanOrEqual(10.6);
  });

  it("never ends before the word's own end", () => {
    expect(audioTail(pause, 10.0, 10.9, 11.1)).toBeGreaterThanOrEqual(10.9);
  });

  it('says it cannot tell when the audio does not cover the word', () => {
    expect(audioTail(pause, 5.0, 5.5, 6)).toBeNull();
    expect(audioTail({ start: 10, step: STEP, level: [] }, 10, 10.5, 11)).toBeNull();
  });

  it('keeps going to the limit while the sound does not die away', () => {
    const loud = shape(10.0, 12.0, [
      [10.0, 0.6],
      [12.0, 0.6],
    ]);
    expect(audioTail(loud, 10.0, 10.5, 11.0)).toBeCloseTo(11.0, 1);
  });

  it('ignores a silent word: a level of nothing is not a reference to compare with', () => {
    const silent = shape(10.0, 12.0, [
      [10.0, 0],
      [12.0, 0],
    ]);
    expect(audioTail(silent, 10.0, 10.5, 11.0)).toBeNull();
  });
});

const timed = (words: [string, string, number, number][]): ChapterDoc => {
  const items = words.map(([key, pid, t0, t1]) => ({ key, pid, t0, t1, st: 'ok', text: key }) as unknown as DocItem);
  return {
    paras: [],
    items,
    index: new Map(items.map((i, n) => [i.key, n])),
    aligned: true,
    engine: { id: 'e', name: 'e' },
    counts: {},
  } as unknown as ChapterDoc;
};

describe('heardWindow with the audio', () => {
  const env = shape(10.0, 12.0, [...STATUES, [11.2, 0.005], [11.24, 0.6], [11.5, 0.7]]);

  it('plays "statues" to the end of its sound when a pause follows', () => {
    const d = timed([
      ['a', 'p1', 10.0, 10.5],
      ['b', 'p1', 11.24, 11.6],
    ]);
    const [, end] = heardWindow(d, 'a', 'a', 10.0, 10.5, env);
    expect(end).toBeGreaterThanOrEqual(10.78);
    expect(end).toBeLessThan(11.24);
  });

  it('without the audio, keeps the fixed tail', () => {
    const d = timed([
      ['a', 'p1', 10.0, 10.5],
      ['b', 'p1', 11.24, 11.6],
    ]);
    expect(heardWindow(d, 'a', 'a', 10.0, 10.5)[1]).toBeCloseTo(10.5 + WORD_TAIL_SECONDS, 6);
  });

  it('never plays into the next word of a touching pair past its middle', () => {
    const d = timed([
      ['a', 'p1', 10.0, 10.5],
      ['b', 'p1', 10.52, 10.7],
    ]);
    const [, end] = heardWindow(d, 'a', 'a', 10.0, 10.5, env);
    expect(end).toBeLessThanOrEqual(10.61 + 1e-9);
  });
});
