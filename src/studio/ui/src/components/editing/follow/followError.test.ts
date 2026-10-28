import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relocate } from './liveItems';
import { asItem, FILE_NAME, playlistFor, recording, score, type Piece } from './followScenarios';

const LEN = recording().length;
const A = (extra: Partial<Piece> = {}): Piece => ({ guid: 'A', position: 10, sourceStart: 0, length: LEN, rate: 1, ...extra });
const rippled = (cut: number, gone: number): Piece[] => [
  A({ length: cut }),
  { guid: 'B', position: 10 + cut, sourceStart: cut + gone, length: LEN - cut - gone, rate: 1 },
];

/** What the page knew (the saved project, by GUID) against what the DAW had, for each edit a narrator makes in REAPER. */
const cases: Array<{ name: string; saved: Piece[]; actual: Piece[]; broken: boolean }> = [
  { name: 'untouched single item', saved: [A()], actual: [A()], broken: false },
  { name: 'moved +5 s, unsaved', saved: [A()], actual: [A({ position: 15 })], broken: true },
  { name: 'trimmed 20 s off the start, unsaved', saved: [A()], actual: [A({ sourceStart: 20, length: LEN - 20 })], broken: true },
  { name: 'rate 1.25, unsaved', saved: [A()], actual: [A({ rate: 1.25, length: LEN / 1.25 })], broken: true },
  { name: '6 s deleted and closed up, unsaved', saved: [A()], actual: rippled(40, 6), broken: true },
  { name: '6 s deleted and closed up, saved', saved: [A({ length: 40 })], actual: rippled(40, 6), broken: true },
  { name: 'split at 40 s, saved', saved: [A({ length: 40 })], actual: rippled(40, 0), broken: true },
];

describe('follow error before and after the live items', () => {
  const rows = cases.map((c) => {
    const before = score({ playlist: playlistFor('A'), items: c.saved.map((p) => asItem(p)) }, c.actual);
    const live = c.actual.map((p) => ({
      guid: p.guid,
      sourceFile: FILE_NAME,
      position: p.position,
      length: p.length,
      sourceStart: p.sourceStart,
      playRate: p.rate,
    }));
    const after = score(relocate(playlistFor('A'), live), c.actual);
    return { ...c, before, after };
  });

  it.each(rows)('$name', ({ before, after, broken }) => {
    if (broken) expect(before.wrongSentence + before.unlit).toBeGreaterThan(before.samples * 0.2);
    expect(after.wrongSentence).toBe(0);
    expect(after.maxMs).toBeLessThan(1);
    expect(after.unlit).toBeLessThan(after.samples * 0.01);
  });

  it('writes the table when SIM_OUT names a file', () => {
    if (!process.env.SIM_OUT) return;
    const f = (s: ReturnType<typeof score>): string =>
      `${s.wrongSentence} wrong / ${s.unlit} unlit of ${s.samples}, up to ${s.maxSentencesOff} sentences, median ${s.medianMs} ms, max ${s.maxMs} ms`;
    writeFileSync(process.env.SIM_OUT, rows.map((r) => `| ${r.name} | ${f(r.before)} | ${f(r.after)} |`).join('\n'));
  });
});
