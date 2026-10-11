import { describe, expect, it } from 'vitest';
import { itemAt, selKeys } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { activePid, ribbonLayout } from './ribbonLayout';
import type { PageState } from '../script/scriptState';

const state = (s: Partial<PageState>): PageState => ({ cursor: null, sel: null, flag: null, playT: null, ...s });

describe('activePid', () => {
  const doc = marksDoc();
  it('is the cursor paragraph, then the selection head, then the playing word', () => {
    expect(activePid(doc, state({ cursor: 'p-2:1', sel: { anchor: 'p-1:0', head: 'p-1:1' }, playT: 5.1 }))).toBe('p-2');
    expect(activePid(doc, state({ sel: { anchor: 'p-1:0', head: 'p-2:1' }, playT: 5.1 }))).toBe('p-2');
    const first = doc.items[0];
    expect(activePid(doc, state({ playT: (first.t0 ?? 0) + 0.01 }))).toBe(itemAt(doc, (first.t0 ?? 0) + 0.01)?.pid);
  });
  it('is null with no cursor, selection or playing word', () => {
    expect(activePid(doc, state({}))).toBeNull();
  });
});

describe('ribbonLayout', () => {
  const doc = marksDoc();
  const para = doc.paras[0];
  it('spans the paragraph and ticks every heard word boundary', () => {
    const l = ribbonLayout(doc, 'p-1', [], null)!;
    expect(l.t0).toBe(para.start);
    expect(l.t1).toBe(para.end);
    // one tick per heard word, and one closing the last
    expect(l.ticks.length).toBe(para.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss').length + 1);
  });
  it('tints flagged words and counts them', () => {
    const l = ribbonLayout(doc, 'p-1', [], null)!;
    // the extra word and the low-confidence word are timed; the word not read and the misread are counted (the misread is timed too)
    expect(l.flags.map((f) => f.kind).sort()).toEqual(['extra', 'low', 'low']);
    expect(l.flagged).toBe(4);
    expect(l.description).toMatch(/flagged/);
  });
  it('clips the selection band and the playhead to the window', () => {
    const keys = selKeys(doc, { anchor: 'p-1:0', head: 'p-2:2' });
    const l = ribbonLayout(doc, 'p-1', keys, 1e9)!;
    expect(l.band!.t1).toBeLessThanOrEqual(l.t1);
    expect(l.playhead).toBeNull();
    const m = ribbonLayout(doc, 'p-1', [], (l.t0 + l.t1) / 2)!;
    expect(m.playhead).toBeCloseTo((l.t0 + l.t1) / 2);
  });
  it('marks a cut word as a gap', () => {
    const cutDoc = marksDoc({ cuts: [{ id: 'c1', a: 4.2, b: 4.3, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }] });
    const l = ribbonLayout(cutDoc, 'p-2', [], null)!;
    expect(l.cuts.length).toBe(1);
  });
  it('is null for a paragraph with no audio', () => {
    expect(ribbonLayout(doc, 'nope', [], null)).toBeNull();
  });
});
