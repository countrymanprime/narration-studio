import { describe, expect, it } from 'vitest';
import { initialPageState, isStale, pageReducer, selectedKeysOf, type PageState } from './scriptState';
import { marksDoc } from './scriptFixtures';

const doc = marksDoc();
const [a, b, c] = doc.items.map((i) => i.key);
const run = (...actions: Parameters<typeof pageReducer>[1][]): PageState => actions.reduce(pageReducer, initialPageState);

describe('page-state-is-one-reducer', () => {
  it('places the cursor, extends from it, selects a run and clears in steps', () => {
    expect(run({ type: 'place', key: a })).toEqual({ ...initialPageState, cursor: a });
    expect(run({ type: 'place', key: a }, { type: 'extend', key: c })).toMatchObject({ cursor: c, sel: { anchor: a, head: c } });
    expect(run({ type: 'place', key: a }, { type: 'extend', key: c }, { type: 'extend', key: b })).toMatchObject({ sel: { anchor: a, head: b } });
    expect(run({ type: 'select', anchor: c, head: a })).toMatchObject({ cursor: a, sel: { anchor: c, head: a } });
    expect(run({ type: 'extend', key: b })).toMatchObject({ cursor: b, sel: null });
  });

  it('opens and closes a flag; moving to another word closes it, a doubled read stays', () => {
    const open = run({ type: 'place', key: a }, { type: 'openFlag', key: a });
    expect(open.flag).toBe(a);
    expect(pageReducer(open, { type: 'place', key: b }).flag).toBeNull();
    expect(pageReducer({ ...open, flag: 'dup:p-1' }, { type: 'place', key: b }).flag).toBe('dup:p-1');
    expect(pageReducer(open, { type: 'closeFlag' }).flag).toBeNull();
  });

  it('Escape closes the card first, then lets the selection go, then does nothing', () => {
    const s = run({ type: 'select', anchor: a, head: c }, { type: 'openFlag', key: c });
    const one = pageReducer(s, { type: 'clear' });
    expect(one).toMatchObject({ flag: null, sel: { anchor: a, head: c } });
    const two = pageReducer(one, { type: 'clear' });
    expect(two.sel).toBeNull();
    expect(pageReducer(two, { type: 'clear' })).toBe(two);
  });

  it('sets the playing time', () => {
    expect(run({ type: 'play', t: 3.5 }).playT).toBe(3.5);
    expect(run({ type: 'play', t: 3.5 }, { type: 'play', t: null }).playT).toBeNull();
  });

  it('a stale key (chapter changed, manuscript replaced) is found, and reset puts all four back', () => {
    const s = run({ type: 'select', anchor: a, head: c }, { type: 'openFlag', key: c }, { type: 'play', t: 2 });
    expect(isStale(doc, s)).toBe(false);
    expect(isStale(doc, { ...s, cursor: 'gone:1' })).toBe(true);
    expect(isStale(doc, { ...s, sel: { anchor: a, head: 'gone:2' } })).toBe(true);
    expect(pageReducer(s, { type: 'reset' })).toEqual(initialPageState);
  });
});

describe('a range on the waveform', () => {
  const span = { start: 5.35, end: 5.85 };
  it('selectSpan selects the words it covers and keeps the exact span for the cut and the effects', () => {
    const s = run({ type: 'selectSpan', span, anchor: a, head: b });
    expect(s).toMatchObject({ cursor: b, sel: { anchor: a, head: b }, span });
  });
  it('a span over no words keeps the span and lets the selection go, leaving the cursor where it was', () => {
    const s = run({ type: 'place', key: a }, { type: 'selectSpan', span, anchor: null, head: null });
    expect(s).toMatchObject({ cursor: a, sel: null, span });
    // the cursor's word is not what a cut or an effect acts on: the range covers none
    expect(selectedKeysOf(doc, s)).toEqual([]);
    expect(selectedKeysOf(doc, run({ type: 'place', key: a }))).toEqual([a]);
  });
  it('dropSpan keeps the words and forgets only the exact times, for a document whose words moved', () => {
    const s = run({ type: 'selectSpan', span, anchor: a, head: b });
    expect(pageReducer(s, { type: 'dropSpan' })).toMatchObject({ sel: { anchor: a, head: b }, span: null });
    expect(pageReducer(initialPageState, { type: 'dropSpan' })).toBe(initialPageState);
  });
  it('any other way of selecting drops the span, so the range never outlives the words it was drawn for', () => {
    const s = run({ type: 'selectSpan', span, anchor: a, head: b });
    for (const action of [
      { type: 'place', key: c },
      { type: 'extend', key: c },
      { type: 'select', anchor: b, head: c },
    ] as const) {
      expect(pageReducer(s, action).span ?? null).toBeNull();
    }
  });
  it('dropRange clears the range and the words it selected, and Escape clears the range after the card', () => {
    const s = run({ type: 'selectSpan', span, anchor: a, head: b }, { type: 'openFlag', key: b });
    expect(pageReducer(s, { type: 'dropRange' })).toMatchObject({ sel: null, span: null, flag: b });
    const one = pageReducer(s, { type: 'clear' });
    expect(one).toMatchObject({ flag: null, span });
    expect(pageReducer(one, { type: 'clear' })).toMatchObject({ sel: null, span: null });
  });
  it('reset forgets the span, and a stale key is still found', () => {
    expect(run({ type: 'selectSpan', span, anchor: a, head: b }, { type: 'reset' })).toEqual(initialPageState);
    expect(initialPageState.span ?? null).toBeNull();
  });
});

// The bottom waveform scrolled by hand: the page holds what it shows so the script can follow, until the cursor moves.
describe('the waveform view the script follows', () => {
  it('holds the stretch the waveform was scrolled to, and the same stretch again changes nothing', () => {
    const viewed = run({ type: 'place', key: a }, { type: 'view', t0: 1, t1: 4 });
    expect(viewed.view).toEqual({ t0: 1, t1: 4 });
    expect(pageReducer(viewed, { type: 'view', t0: 1, t1: 4 })).toBe(viewed);
    expect(pageReducer(viewed, { type: 'view', t0: 2, t1: 5 }).view).toEqual({ t0: 2, t1: 5 });
  });
  it('lets it go when the cursor or the selection moves, and keeps it while playback ticks', () => {
    const viewed = run({ type: 'place', key: a }, { type: 'view', t0: 1, t1: 4 });
    expect(pageReducer(viewed, { type: 'place', key: b }).view).toBeNull();
    expect(pageReducer(viewed, { type: 'select', anchor: a, head: c }).view).toBeNull();
    expect(pageReducer(viewed, { type: 'play', t: 2 }).view).toEqual({ t0: 1, t1: 4 });
    expect(pageReducer(viewed, { type: 'reset' }).view).toBeUndefined();
  });
});
