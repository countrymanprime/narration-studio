import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baseTake,
  canStack,
  canUnstack,
  chapterRetryMode,
  isStacked,
  movableTakes,
  passageEnd,
  passageStart,
  retryModeOf,
  stackable,
  shiftAfter,
  stackGeometry,
  stackPassage,
  stackPassages,
  stackPlanOf,
  unstackGeometry,
  unstackPassage,
  type StackDocument,
  type StackPassage,
} from './stacking';

const FC = { seed: 20261011, numRuns: 200 };
const take = (id: string, start: number, len: number) => ({ id, start, len });
const passage = (id: string, takes: ReturnType<typeof take>[], over: Partial<StackPassage> = {}): StackPassage => ({
  id,
  chapterId: '5',
  kept: false,
  takes,
  ...over,
});
const doc = (passages: StackPassage[], over: Partial<StackDocument> = {}): StackDocument => ({ passages, findings: [], effects: [], cuts: [], ...over });
const starts = (d: StackDocument, id: string) => Object.fromEntries(d.passages.find((p) => p.id === id)!.takes.map((t) => [t.id, t.start]));

const tenth = (n: number): number => Math.round(n * 10) / 10;

/** Passages one after another on a 0.1 s grid; each has two or three reads, later ones further along than the first. */
const chapterArb = fc
  .array(
    fc.record({
      gap: fc.integer({ min: 0, max: 50 }),
      reads: fc.array(fc.record({ off: fc.integer({ min: 1, max: 200 }), len: fc.integer({ min: 10, max: 100 }) }), { minLength: 1, maxLength: 3 }),
      firstLen: fc.integer({ min: 10, max: 100 }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((rows) => {
    let cursor = 10;
    return rows.map((r, i) => {
      const first = tenth(cursor + r.gap / 10);
      let end = tenth(first + r.firstLen / 10);
      const takes = [take(`T${i}-0`, first, r.firstLen / 10)];
      let at = first;
      r.reads.forEach((x, j) => {
        at = tenth(at + x.off / 10);
        takes.push(take(`T${i}-${j + 1}`, at, x.len / 10));
        end = tenth(Math.max(end, at + x.len / 10));
      });
      cursor = tenth(end + 0.1);
      return passage(`p${i}`, takes);
    });
  });

describe('the stacking model', () => {
  it('defaults-leave-takes-where-they-are', () => {
    const s = { retryMode: 'leave', retryChapters: {} } as const;
    const p = passage('p', [take('a', 1, 2)]);
    expect(chapterRetryMode(s, '5')).toBe('leave');
    expect(retryModeOf(s, p)).toBe('leave');
    const proj = { retryMode: 'stack', retryChapters: {} } as const;
    expect(retryModeOf(proj, p)).toBe('stack');
    const chap = { retryMode: 'stack', retryChapters: { '5': 'leave' } } as const;
    expect(retryModeOf(chap, p)).toBe('leave');
    expect(retryModeOf(chap, { ...p, chapterId: '6' })).toBe('stack');
    expect(retryModeOf(chap, { ...p, retryMode: 'stack' })).toBe('stack');
    const group = passage('g', [take('a', 10, 5), take('b', 20, 5)]);
    expect(stackable(s, [group], '5')).toEqual([]);
    expect(stackable(proj, [group, passage('x', [take('c', 1, 1)])], '5')).toEqual([group]);
    expect(stackable(proj, [group], '6')).toEqual([]);
  });

  it('a-retry-group-is-a-passage-with-movable-takes', () => {
    const group = passage('p', [take('a', 10, 5), take('b', 20, 5)]);
    expect(canStack(group)).toBe(true);
    expect(canStack({ ...group, kept: true })).toBe(false);
    expect(canStack(passage('d', [take('a', 10, 5)]))).toBe(false);
    expect(canStack(passage('e', [take('a', 10, 5), take('b', 10.04, 5)]))).toBe(false);
    expect(canStack(passage('f', [take('a', 10, 5), take('b', 10.06, 5)]))).toBe(true);
    expect(movableTakes(group).map((t) => t.id)).toEqual(['b']);
    expect(baseTake(passage('g', [take('b', 20, 5), take('a', 10, 5)])).id).toBe('a');
  });

  it('stacking-puts-every-later-read-on-the-first-and-closes-the-space', () => {
    const p = passage('p', [take('a', 10, 5), take('b', 20, 8), take('c', 30, 9)]);
    const g = stackGeometry(p);
    expect(g.moves.map((m) => [m.takeId, m.from, m.to])).toEqual([
      ['b', 20, 10],
      ['c', 30, 10],
    ]);
    expect(g.before).toEqual({ start: 10, end: 39 });
    expect(g.after).toEqual({ start: 10, end: 19 });
    expect(g.shift).toBe(-20);
    const d = stackPassage(doc([p, passage('q', [take('x', 40, 3)])]), 'p');
    expect(starts(d, 'p')).toEqual({ a: 10, b: 10, c: 10 });
    expect(starts(d, 'q')).toEqual({ x: 20 });
    expect(d.passages[0].stack).toEqual({ base: 'a', offsets: { b: 10, c: 20 } });
    fc.assert(
      fc.property(chapterArb, (ps) => {
        const out = stackPassages(
          doc(ps),
          ps.map((x) => x.id),
        ).passages;
        out.forEach((x, i) => {
          if (canStack(ps[i]) || movableTakes(ps[i]).length) expect(new Set(x.takes.map((t) => t.start)).size).toBe(1);
          expect(baseTake(x).start).toBe(passageStart(x));
          if (i > 0) expect(passageStart(x)).toBeGreaterThanOrEqual(passageEnd(out[i - 1]) - 0.05);
        });
      }),
      FC,
    );
  });

  it('stacking-a-whole-chapter-keeps-passages-apart-in-order', () => {
    const ps = [passage('p', [take('a', 10, 5), take('b', 20, 5)]), passage('q', [take('c', 30, 4), take('d', 40, 4)])];
    const plan = stackPlanOf(ps);
    expect(plan.groups.map((g) => [g.passage.id, g.ahead, g.shift])).toEqual([
      ['p', 0, -10],
      ['q', -10, -10],
    ]);
    expect(plan.groups[1].moves).toEqual([{ takeId: 'd', from: 30, to: 20, len: 4 }]);
    expect(plan.shift).toBe(-20);
    expect(plan.takes).toBe(2);
    expect(plan.region).toEqual({ start: 10, end: 44 });
    const out = stackPassages(doc(ps), ['q', 'p']).passages;
    expect(starts(doc([...out]), 'q')).toEqual({ c: 20, d: 20 });
    expect(passageStart(out[1])).toBeGreaterThanOrEqual(passageEnd(out[0]));
    expect(stackPlanOf([passage('k', [take('a', 1, 1)])]).region).toBeNull();
  });

  it('un-stack-restores-by-recorded-offsets', () => {
    fc.assert(
      fc.property(chapterArb, fc.boolean(), (ps, reverse) => {
        const original = doc(ps);
        const stacked = stackPassages(
          original,
          ps.map((x) => x.id),
        );
        const order = stacked.passages.filter(isStacked).map((x) => x.id);
        const back = (reverse ? order.slice().reverse() : order).reduce((d, id) => unstackPassage(d, id), stacked);
        expect(back.passages).toEqual(original.passages);
        back.passages.forEach((x) => expect(x.stack).toBeUndefined());
      }),
      FC,
    );
    const p = passage('p', [take('a', 10, 5), take('b', 20, 5), take('c', 30, 5)]);
    const stacked = stackPassage(doc([p]), 'p', ['b']);
    expect(stacked.passages[0].stack).toEqual({ base: 'a', offsets: { b: 10 } });
    expect(unstackGeometry(stacked.passages[0]).moves).toEqual([{ takeId: 'b', from: 10, to: 20, len: 5 }]);
    expect(unstackGeometry(stacked.passages[0]).shift).toBe(0);
    expect(unstackPassage(stacked, 'p').passages[0]).toEqual(p);
  });

  it('a-kept-take-blocks-both', () => {
    const p = passage('p', [take('a', 10, 5), take('b', 20, 5)]);
    const stacked = stackPassage(doc([p]), 'p').passages[0];
    expect([canStack(p), canUnstack(stacked)]).toEqual([true, true]);
    const kept = { ...p, kept: true };
    expect([canStack(kept), canUnstack({ ...stacked, kept: true })]).toEqual([false, false]);
    expect(stackPassage(doc([kept]), 'p').passages[0]).toBe(kept);
    expect(unstackPassage(doc([{ ...stacked, kept: true }]), 'p').passages[0].takes).toEqual(stacked.takes);
    expect([canStack({ ...kept, kept: false }), canUnstack({ ...stacked, kept: false })]).toEqual([true, true]);
  });

  it('later-things-follow-the-audio', () => {
    const p = passage('p', [take('a', 10, 5), take('b', 20, 5)]);
    const d = doc([p, passage('q', [take('x', 30, 2)]), passage('other', [take('y', 30, 2)], { chapterId: '6' })], {
      findings: [
        { id: 'early', chapterId: '5', sec: 3 },
        { id: 'late', chapterId: '5', sec: 31 },
        { id: 'elsewhere', chapterId: '6', sec: 31 },
      ],
      effects: [{ id: 'fx', chapterId: '5', start: 32, end: 34 }],
      cuts: [
        { id: 'c1', chapterId: '5', a: 28, b: 29, mode: 'close' },
        { id: 'c0', chapterId: '5', a: 2, b: 3, mode: 'gap' },
      ],
    });
    const out = stackPassage(d, 'p');
    expect(out.findings.map((f) => f.sec)).toEqual([3, 21, 31]);
    expect(out.effects[0]).toMatchObject({ start: 22, end: 24 });
    expect(out.cuts.map((c) => [c.a, c.b])).toEqual([
      [18, 19],
      [2, 3],
    ]);
    expect(starts(out, 'other')).toEqual({ y: 30 });
    expect(unstackPassage(out, 'p').findings).toEqual(d.findings);
    expect(shiftAfter(d, '5', 30, 0.02, 'p')).toBe(d);
  });

  it('pure-and-deterministic: types only from model/, no React, api or ports', () => {
    const src = readFileSync(join(__dirname, 'stacking.ts'), 'utf8');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports).toEqual(['./cuts']);
    expect(src).toMatch(/import type \{ CutSpan \} from '\.\/cuts'/);
    const p = passage('p', [take('a', 10, 5), take('b', 20, 5)]);
    expect(stackPassage(doc([p]), 'p')).toEqual(stackPassage(doc([p]), 'p'));
    expect(p.takes[1].start).toBe(20);
  });
});
