import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { shiftPeaks } from '../ribbon/docClock';
import { envelopeOf } from '../ribbon/useChapterSound';
import type { ChapterDoc, DocItem } from './doc';
import { heardWindow, MAX_TAIL_SECONDS } from './runway';

/**
 * The end of a play on real speech. The fixtures are LibriVox readings (public domain; `fixtures/realSpeech/README.md`) aligned by the app's own
 * recognizer settings, with the host's 20 ms peaks (what the play sees) and a separate 5 ms level track in dB (what this test measures with).
 * A word is clipped when sound within 30 dB of the word's own peak, and 10 dB above the room, still plays more than 30 ms after the planned stop.
 * The old rule was checked on a made-up envelope only, and the owner still heard "statue" for "statues".
 */
interface Fixture {
  name: string;
  words: { w: string; t0: number; t1: number; seg: number }[];
  peaks: WorkspacePeaks;
  rms: { hopSeconds: number; windowSeconds: number; dbBase64: string };
}

const load = (name: string): Fixture => JSON.parse(readFileSync(join(__dirname, 'fixtures/realSpeech', `${name}.json`), 'utf8')) as Fixture;
const FILES = ['alice-ch1-librivox', 'alice-ch5-librivox', 'speckled-band-librivox', 'jungle-book-librivox'];

const REL_DB = -30;
const OVER_ROOM_DB = 10;
const HOLD_SECONDS = 0.06;
const CLIP_TOLERANCE_SECONDS = 0.03;

const percentile = (values: Float64Array, p: number): number => {
  const sorted = Float64Array.from(values).sort();
  const at = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (at - lo);
};

type Group = 'last word of a line' | 'pause (next word 300 ms or more later)' | 'pause (next word under 300 ms later)' | 'touching the next word';
interface Row {
  word: string;
  group: Group;
  lostSeconds: number;
}

/** For every word with sound under it: how long audible sound of the word plays after the stop that `plan` gives for it. */
function measure(f: Fixture, plan: (doc: ChapterDoc, key: string, t0: number, t1: number) => number): Row[] {
  const doc = docOf(f);
  const bytes = Buffer.from(f.rms.dbBase64, 'base64');
  const db = Float64Array.from(bytes, (b) => b / 2 - 120);
  const { hopSeconds: hop, windowSeconds: win } = f.rms;
  const centre = win / 2;
  const at = (t: number): number => Math.round((t - centre) / hop);
  const time = (i: number): number => i * hop + centre;
  const room = percentile(db, 10);
  const rows: Row[] = [];
  f.words.forEach((w, n) => {
    const next = f.words[n + 1];
    const a = Math.max(0, at(w.t0));
    const b = Math.min(db.length - 1, at(w.t1));
    if (b <= a) return;
    let peakAt = a;
    for (let i = a; i <= b; i += 1) if (db[i] > db[peakAt]) peakAt = i;
    const peak = db[peakAt];
    if (peak < room + 20) return;
    const threshold = Math.max(peak + REL_DB, room + OVER_ROOM_DB);
    // The join with the next word: the quietest moment between this word's peak and the next word's peak.
    let limit = Math.min(db.length - 1, at(w.t1 + 1));
    if (next) {
      const na = at(next.t0);
      const nb = Math.min(db.length - 1, at(next.t1));
      if (nb > na) {
        let np = na;
        for (let i = na; i <= nb; i += 1) if (db[i] > db[np]) np = i;
        limit = Math.min(limit, np);
      }
    }
    let valley = peakAt;
    for (let i = peakAt; i <= limit; i += 1) if (db[i] < db[valley]) valley = i;
    const hold = Math.round(HOLD_SECONDS / hop);
    let run = 0;
    let end = valley;
    for (let i = peakAt; i <= valley; i += 1) {
      run = db[i] < threshold ? run + 1 : 0;
      if (run >= hold) {
        end = i - hold + 1;
        break;
      }
    }
    const stop = plan(doc, `w${n}`, w.t0, w.t1);
    const gap = next ? next.t0 - w.t1 : Infinity;
    const last = !next || next.seg !== w.seg;
    const group: Group = last
      ? 'last word of a line'
      : gap < 0.05
        ? 'touching the next word'
        : gap < 0.3
          ? 'pause (next word under 300 ms later)'
          : 'pause (next word 300 ms or more later)';
    rows.push({ word: w.w, group, lostSeconds: Math.max(0, time(end) - stop) });
  });
  return rows;
}

function docOf(f: Fixture): ChapterDoc {
  const items = f.words.map((w, n) => ({ key: `w${n}`, pid: `s${w.seg}`, t0: w.t0, t1: w.t1, st: 'ok', text: w.w }) as unknown as DocItem);
  return {
    paras: [],
    items,
    index: new Map(items.map((i, n) => [i.key, n])),
    aligned: true,
    engine: { id: 'e', name: 'e' },
    counts: {},
  } as unknown as ChapterDoc;
}

/** The play of one word as the Editing page plans it: the chapter's peaks to `heardWindow`. */
const planned =
  (f: Fixture) =>
  (doc: ChapterDoc, key: string, t0: number, t1: number): number =>
    heardWindow(doc, key, key, t0, t1, envelopeOf([shiftPeaks(f.peaks, 0)], t0, t1 + MAX_TAIL_SECONDS + 0.1))[1];
/** The same word stopped on the recognizer's end, as it was before any tail. */
const atAlignedEnd = (_doc: ChapterDoc, _key: string, _t0: number, t1: number): number => t1;

const rate = (rows: Row[], group?: Group): number => {
  const some = group ? rows.filter((r) => r.group === group) : rows;
  return some.filter((r) => r.lostSeconds > CLIP_TOLERANCE_SECONDS).length / some.length;
};

describe('the end of a play on real speech', () => {
  const fixtures = FILES.map(load);
  const all = (plan: (f: Fixture) => Parameters<typeof measure>[1]): Row[] => fixtures.flatMap((f) => measure(f, plan(f)));

  it('has real speech to measure: over two thousand words, four readings', () => {
    expect(fixtures.reduce((n, f) => n + f.words.length, 0)).toBeGreaterThan(2300);
    expect(all(() => atAlignedEnd).length).toBeGreaterThan(2000);
  });

  it("the recognizer's own end clips a good share of words (what the tail is for)", () => {
    expect(rate(all(() => atAlignedEnd))).toBeGreaterThan(0.15);
  });

  it('plays the sound of a word out to the end, wherever it falls in a line', () => {
    const rows = all(planned);
    expect(rate(rows)).toBeLessThanOrEqual(0.035);
    expect(rate(rows, 'last word of a line')).toBeLessThanOrEqual(0.07);
    expect(rate(rows, 'pause (next word under 300 ms later)')).toBeLessThanOrEqual(0.04);
    expect(rate(rows, 'pause (next word 300 ms or more later)')).toBeLessThanOrEqual(0.09);
    expect(rate(rows, 'touching the next word')).toBeLessThanOrEqual(0.03);
  });

  it('holds on a reading it was not tuned on', () => {
    const held = measure(load('jungle-book-librivox'), planned(load('jungle-book-librivox')));
    expect(rate(held)).toBeLessThanOrEqual(0.045);
  });
});
