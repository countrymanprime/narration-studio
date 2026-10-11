import { describe, expect, it, vi } from 'vitest';
import { createSelector } from './createSelector';

type State = { a: { n: number }; b: { s: string }; c: number };
const state: State = { a: { n: 1 }, b: { s: 'x' }, c: 0 };

describe('createSelector', () => {
  it('returns the same reference while its inputs keep theirs, and recomputes once an input changes', () => {
    const combine = vi.fn((a: { n: number }, b: { s: string }) => ({ text: `${b.s}${a.n}` }));
    const select = createSelector([(s: State) => s.a, (s: State) => s.b], combine);
    const first = select(state);
    expect(select({ ...state, c: 1 })).toBe(first);
    expect(combine).toHaveBeenCalledTimes(1);
    const next = select({ ...state, b: { s: 'y' } });
    expect(next).not.toBe(first);
    expect(next.text).toBe('y1');
    expect(combine).toHaveBeenCalledTimes(2);
  });

  it('composes: a selector built by createSelector is an input of another', () => {
    const text = createSelector([(s: State) => s.a], (a) => ({ text: `n${a.n}` }));
    const shout = createSelector([text], (t) => t.text.toUpperCase());
    expect(shout(state)).toBe('N1');
    expect(shout({ ...state, c: 5 })).toBe('N1');
  });
});
