import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  alignToScript,
  buildDoc,
  curTime,
  cutLength,
  firstFrom,
  flagged,
  itemAt,
  laterAudio,
  origTime,
  rangeKeys,
  scriptSpan,
  selKeys,
  stepFlag,
  stepKey,
  stepPhrase,
  summarize,
  takeShift,
  type Aligner,
  type ChapterInput,
  type DocCut,
  type Heard,
  type HeardWord,
  type ScriptParagraph,
} from '.';

const w = (text: string, conf = 0.95): HeardWord => ({ text, off0: 0, off1: 0.2, conf });

type Edit =
  | { op: 'add'; at: number; words: string; conf: number }
  | { op: 'drop'; at: number }
  | { op: 'sub'; at: number; heard: string; conf: number }
  | { op: 'low'; at: number; conf: number };

/** A deterministic stand-in for the recogniser: words timed in order from the text, with the given edits applied. */
function aligner(edits: Record<string, Edit[]> = {}, transcribed = true): Aligner {
  return {
    engine: () => ({ id: 'test', name: 'Test recogniser' }),
    snap: (sec) => Math.round((sec + 0.001) * 1000) / 1000,
    heard({ id, text, len }): Heard | null {
      if (!transcribed) return null;
      const own = edits[id] ?? [];
      const out: Array<{ text: string; conf: number; added: boolean }> = [];
      text
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word, i) => {
          own
            .filter((e) => e.op === 'add' && e.at === i)
            .forEach((e) => e.op === 'add' && e.words.split(' ').forEach((x) => out.push({ text: x, conf: e.conf, added: true })));
          if (own.some((e) => e.op === 'drop' && e.at === i)) return;
          const s = own.find((e) => e.op === 'sub' && e.at === i);
          const l = own.find((e) => e.op === 'low' && e.at === i);
          out.push({ text: s?.op === 'sub' ? s.heard : word, conf: s?.op === 'sub' ? s.conf : l?.op === 'low' ? l.conf : 0.97, added: false });
        });
      let t = 0.15;
      const words = out.map((x) => {
        const off0 = t;
        t += 0.3;
        const word: HeardWord = { text: x.text, off0, off1: t, conf: x.conf, ...(x.added ? { added: true } : {}) };
        t += 0.1;
        return word;
      });
      return { words, len: len ?? t + 0.15 };
    },
  };
}

const TEXT1 = 'The cat sat down. It was a quiet morning. Several birds sang.';
const unitsOf = (text: string): ScriptParagraph['units'] =>
  [...text.matchAll(/[^.]+\.\s*/g)].map((m, k) => ({ key: `u${k}@${m.index}`, s: m.index ?? 0, e: (m.index ?? 0) + m[0].length }));
const para1: ScriptParagraph = { id: 'p1', text: TEXT1, units: unitsOf(TEXT1), take: { id: 'T1', text: TEXT1, start: 10, len: 14, s: 0, e: TEXT1.length } };
const para2: ScriptParagraph = { id: 'p2', text: 'Then all was still.', units: unitsOf('Then all was still.') };
const EDITS: Record<string, Edit[]> = {
  T1: [
    { op: 'add', at: 1, words: 'um sorry', conf: 0.9 },
    { op: 'low', at: 7, conf: 0.62 },
    { op: 'sub', at: 8, heard: 'mourning', conf: 0.54 },
    { op: 'drop', at: 9 },
  ],
};
const input = (over: Partial<ChapterInput> = {}): ChapterInput => ({
  paragraphs: [para1, para2],
  aligner: aligner(EDITS),
  cuts: [],
  effects: [],
  accepted: [],
  ...over,
});
const cut: DocCut = { id: 'c1', takeId: 'T1', keys: ['p1:x0', 'p1:x1'], a: 10.7, b: 11.5, off0: 0.7, off1: 1.5, mode: 'close' };

describe('setting what was heard against the script', () => {
  it('matches-ignoring-case-and-punctuation: ok, extra, miss and misread', () => {
    const ops = alignToScript(['The', 'cat,', 'sat', 'down.'], [w('the'), w('um'), w('cat'), w('sad'), w('down')]);
    expect(ops.map((o) => (o.kind === 'x' ? 'x:' + o.heard.text : o.st + ':' + o.i))).toEqual(['ok:0', 'x:um', 'ok:1', 'mis:2', 'ok:3']);
    expect(alignToScript(['a', 'b', 'c'], [w('a'), w('c')]).map((o) => (o.kind === 'x' ? 'x' : o.st))).toEqual(['ok', 'miss', 'ok']);
    const mixed = alignToScript(['one', 'cat', 'end'], [w('one'), w('cap'), w('zebra'), w('end')]);
    expect(mixed.map((o) => (o.kind === 'x' ? 'x:' + o.heard.text : o.st + ':' + (o.heard?.text ?? '')))).toEqual(['ok:one', 'mis:cap', 'x:zebra', 'ok:end']);
    const drop = alignToScript(['one', 'three', 'cat', 'end'], [w('one'), w('cap'), w('end')]);
    expect(drop.map((o) => (o.kind === 'x' ? 'x' : o.st + ':' + (o.heard?.text ?? '')))).toEqual(['ok:one', 'miss:', 'mis:cap', 'ok:end']);
  });
});

describe('the chapter document', () => {
  it('chapter-doc-has-stable-keys: the same inputs give equal documents; flags come from the alignment; cut and kept words stop being flagged', () => {
    const d = buildDoc(input());
    expect(d.aligned).toBe(true);
    expect(d.counts).toEqual({ extra: 1, miss: 1, mis: 1, low: 1 });
    const p1 = d.paras[0];
    expect(p1.items.filter((i) => i.st === 'extra').map((i) => i.key + ':' + i.text)).toEqual(['p1:x0:um', 'p1:x1:sorry']);
    expect(p1.items.find((i) => i.st === 'mis')).toMatchObject({ text: 'morning.', heard: 'mourning', conf: 0.54 });
    expect(p1.items.find((i) => i.st === 'miss')?.text).toBe('Several');
    expect(buildDoc(input())).toEqual(d);
    expect(buildDoc(input()).items.map((i) => i.key)).toEqual(d.items.map((i) => i.key));
    const cutDoc = buildDoc(input({ cuts: [cut] }));
    expect(cutDoc.counts.extra).toBe(0);
    expect(cutDoc.items.find((i) => i.key === 'p1:x0')?.cut).toBe('c1');
    expect(buildDoc(input({ accepted: ['p1:x0', 'p1:x1', 'p1:8'] })).counts).toEqual({ extra: 0, miss: 1, mis: 0, low: 1 });
  });
  it('a paragraph with no take has no times, and the recorded ones keep theirs', () => {
    const tokens = (t: string) => t.split(/\s+/).filter(Boolean).length;
    const percent = (tokens(TEXT1) / (tokens(TEXT1) + tokens(para2.text))) * 100;
    const whole = buildDoc(input());
    const partly = buildDoc(input({ recordedPercent: percent }));
    const timed = (d: ReturnType<typeof buildDoc>, pid: string) => d.items.filter((i) => i.pid === pid).map((i) => i.t0 != null && i.t1 != null);
    // The line with a take is heard the same either way; the line after the recording stopped has no times.
    expect(timed(partly, 'p1').some(Boolean)).toBe(true);
    expect(partly.items.filter((i) => i.pid === 'p1').map((i) => [i.t0, i.t1])).toEqual(whole.items.filter((i) => i.pid === 'p1').map((i) => [i.t0, i.t1]));
    expect(timed(partly, 'p2').some(Boolean)).toBe(false);
    expect(partly.paras[1]!.recorded).toBe(false);
    expect(partly.paras[0]!.recorded).toBe(true);
  });
  it('a second read of a line is a run of extra items', () => {
    const t2 = 'Then all was still. Then all was still.';
    const p: ScriptParagraph = { ...para2, take: { id: 'T2', text: t2, start: 40, len: 9, s: 0, e: para2.text.length } };
    const d = buildDoc(input({ paragraphs: [p], aligner: aligner() }));
    const extras = d.items.filter((i) => i.st === 'extra');
    expect(extras).toHaveLength(4);
    expect(extras.every((i) => i.dup && i.run === extras[0].run)).toBe(true);
    expect(d.counts.extra).toBe(1);
  });
  it('every-heard-word-follows-the-one-before: start and end, in order, inside the take', () => {
    const d = buildDoc(input());
    const heard = d.paras[0].items.filter((i) => i.st !== 'miss');
    expect(heard.length).toBeGreaterThan(8);
    heard.forEach((x, k) => {
      expect(x.t1 as number).toBeGreaterThan(x.t0 as number);
      expect(x.t0 as number).toBeGreaterThanOrEqual(10);
      expect(x.t1 as number).toBeLessThanOrEqual(24);
      if (k) expect(x.t0 as number).toBeGreaterThanOrEqual(heard[k - 1].t1 as number);
    });
  });
  it('answers an unaligned document when nothing was transcribed', () => {
    const d = buildDoc(input({ aligner: aligner({}, false) }));
    expect(d.aligned).toBe(false);
    expect(d.items.every((i) => i.t0 === null && i.st === 'ok')).toBe(true);
  });
  it('words after a closed cut inside the take move up by its length', () => {
    const before = buildDoc(input());
    const after = buildDoc(input({ cuts: [cut] }));
    const at = (d: typeof before, k: string) => d.items.find((i) => i.key === k)?.t0 as number;
    expect(at(before, 'p1:3') - at(after, 'p1:3')).toBeCloseTo(0.8, 3);
    expect(at(after, 'p1:0')).toBe(at(before, 'p1:0'));
  });
});

describe('selection model', () => {
  const d = buildDoc(input());
  it('a-selection-is-whole-words-in-text-order: either drag direction, across paragraphs, unknown keys empty', () => {
    expect(rangeKeys(d, 'p1:x0', 'p1:x1')).toEqual(['p1:x0', 'p1:x1']);
    expect(rangeKeys(d, 'p1:x1', 'p1:x0')).toEqual(['p1:x0', 'p1:x1']);
    const across = rangeKeys(d, 'p1:7', 'p2:1');
    expect(across[0]).toBe('p1:7');
    expect(across.at(-1)).toBe('p2:1');
    expect(new Set(across.map((k) => k.split(':')[0]))).toEqual(new Set(['p1', 'p2']));
    expect(rangeKeys(d, 'nope', 'p1:1')).toEqual([]);
    expect(selKeys(d, null)).toEqual([]);
    expect(selKeys(d, { anchor: 'p1:x1', head: 'p1:x0' })).toEqual(['p1:x0', 'p1:x1']);
  });
  it('steps-by-word-phrase-and-flag, never past the text', () => {
    expect(stepKey(d, null, 1)).toBe(d.items[0].key);
    expect(stepKey(d, null, -1)).toBe(d.items.at(-1)?.key);
    expect(stepKey(d, d.items[0].key, -1)).toBe(d.items[0].key);
    expect(stepKey(d, d.items.at(-1)?.key ?? null, 1)).toBe(d.items.at(-1)?.key);
    const next = stepPhrase(d, 'p1:0', 1) as string;
    expect(d.items[d.index.get(next) as number].uKey).not.toBe(d.items[d.index.get('p1:0') as number].uKey);
    expect(stepPhrase(d, next, -1)).toBe('p1:0');
    const keys = flagged(d).map((i) => i.key);
    expect(keys).toEqual(['p1:x0', 'p1:7', 'p1:8', 'p1:9']);
    expect(stepFlag(d, null, 1)).toBe('p1:x0');
    expect(stepFlag(d, 'p1:x0', 1)).toBe('p1:7');
    expect(stepFlag(d, 'p1:x0', -1)).toBe('p1:9');
    expect(stepFlag(d, 'p1:9', 1)).toBe('p1:x0');
  });
  it('finds the word at a time, and firstFrom skips words not read', () => {
    const it = d.items[d.index.get('p1:3') as number];
    expect(itemAt(d, (it.t0 as number) + 0.01)?.key).toBe('p1:3');
    expect(firstFrom(d, 'p1:9')?.key).not.toBe('p1:9');
    expect(firstFrom(d, null)?.key).toBe('p1:0');
  });
});

describe('what a selection comes to', () => {
  const d = buildDoc(input());
  const snap = aligner().snap;
  it('summarize-counts-and-ranges: snapped range, same range from the take start, pad, low count, unread left out, one range per paragraph', () => {
    const sum = summarize(d, rangeKeys(d, 'p1:x0', 'p1:x1'), [], snap);
    expect(sum.allExtra).toBe(true);
    expect(sum.audible).toHaveLength(2);
    expect(sum.words).toBe('um sorry');
    const r = sum.ranges[0];
    const first = d.items[d.index.get('p1:x0') as number];
    const last = d.items[d.index.get('p1:x1') as number];
    expect(sum.ranges).toHaveLength(1);
    expect(r.takeId).toBe('T1');
    expect(Math.abs(r.start - (first.t0 as number))).toBeLessThanOrEqual(0.0021);
    expect(Math.abs(r.end - (last.t1 as number))).toBeLessThanOrEqual(0.0021);
    expect(r.off0).toBeCloseTo(first.off0 as number, 3);
    expect(r.a).toBeCloseTo(r.start, 3);
    expect(sum.len).toBeCloseTo(r.end - r.start, 3);
    const keys = rangeKeys(d, 'p1:x0', 'p1:x1');
    expect(summarize(d, keys, [], snap).len - summarize(d, keys, [], snap, 50).len).toBeGreaterThan(0.09);
    expect(summarize(d, rangeKeys(d, 'p1:6', 'p1:8'), [], snap).low).toBe(1);
    const miss = summarize(d, ['p1:9'], [], snap);
    expect(miss.audible).toHaveLength(0);
    expect(miss.ranges).toHaveLength(0);
    expect(summarize(d, rangeKeys(d, 'p1:10', 'p2:1'), [], snap).ranges.map((x) => x.pid)).toEqual(['p1', 'p2']);
  });
  it('later-audio-after-a-range: the first later word and where it goes', () => {
    const sum = summarize(d, rangeKeys(d, 'p1:x0', 'p1:x1'), [], snap);
    const later = laterAudio(d, sum.ranges[0]);
    expect(later).not.toBeNull();
    expect((later?.before ?? 0) - (later?.after ?? 0)).toBeCloseTo(sum.len, 2);
    const lastRange = summarize(d, [d.items.at(-1)?.key ?? ''], [], snap).ranges[0];
    expect(laterAudio(d, lastRange)).toBeNull();
  });
  it('spans of the script count only written words', () => {
    const items = rangeKeys(d, 'p1:0', 'p1:x1').map((k) => d.items[d.index.get(k) as number]);
    const g = scriptSpan(para1, items);
    expect(g?.q).toBe(para1.text.slice(g?.s, g?.e));
    expect(scriptSpan(para1, [d.items[d.index.get('p1:x0') as number]])).toBeNull();
  });
});

describe('cut arithmetic', () => {
  const cuts = [
    { a: 10, b: 12, mode: 'close' as const },
    { a: 30, b: 31, mode: 'close' as const },
    { a: 50, b: 55, mode: 'gap' as const },
  ];
  it('cut-arithmetic-moves-later-audio-up: closed cuts move audio up, gaps move nothing', () => {
    expect([5, 10, 11, 12, 20, 40, 52].map((t) => curTime(cuts, t))).toEqual([5, 10, 10, 10, 18, 37, 49]);
    expect(cutLength(cuts)).toBe(3);
  });
  it('puts a time back whichever order the cuts were made in', () => {
    for (const t of [5, 10, 18, 27, 37, 49]) expect(curTime(cuts, origTime(cuts, t))).toBeCloseTo(t, 9);
    expect(origTime(cuts, 18)).toBe(20);
    expect(origTime([...cuts].reverse(), 37)).toBe(40);
  });
  it('takeShift moves words after a cut inside the same take', () => {
    const c: DocCut[] = [
      { id: 'a', keys: ['k'], a: 0, b: 2, mode: 'close', takeId: 't', off0: 3, off1: 5 },
      { id: 'b', keys: ['k'], a: 0, b: 1, mode: 'gap', takeId: 't', off0: 8, off1: 9 },
    ];
    expect([takeShift(c, 't', 4), takeShift(c, 't', 5), takeShift(c, 't', 9), takeShift(c, 'u', 9)]).toEqual([0, 2, 2, 0]);
  });
  it('cut-arithmetic-properties: origTime inverts curTime outside every cut', () => {
    // Non-overlapping cuts from sorted distinct integer-tenths boundaries; a time is kept only if it lies outside every cut.
    const spans = fc.uniqueArray(fc.integer({ min: 0, max: 2000 }), { minLength: 2, maxLength: 12 }).map((xs) => {
      const s = [...xs].sort((a, b) => a - b);
      const out: Array<{ a: number; b: number; mode: 'close' | 'gap' }> = [];
      for (let i = 0; i + 1 < s.length; i += 2) out.push({ a: s[i] / 10, b: s[i + 1] / 10, mode: i % 4 === 0 ? 'close' : 'gap' });
      return out;
    });
    fc.assert(
      fc.property(spans, fc.integer({ min: 0, max: 2100 }), (list, tt) => {
        const t = tt / 10;
        fc.pre(list.every((c) => t < c.a || t >= c.b));
        fc.pre(list.every((c) => c.mode === 'gap' || t !== c.a));
        expect(origTime(list, curTime(list, t))).toBeCloseTo(t, 6);
      }),
      { seed: 20261011, numRuns: 500 },
    );
  });
});
