import { describe, expect, it } from 'vitest';
import { initialPageState, isStale, pageReducer, type PageState } from './scriptState';
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
