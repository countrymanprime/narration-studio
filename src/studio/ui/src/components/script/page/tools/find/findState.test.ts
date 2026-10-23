import { describe, expect, it } from 'vitest';
import { createScriptView, type ScriptViewState } from '../../data/scriptView';
import { closeFind, escapeClosesFind, openFind, stepFind } from './findState';

const initial = () => createScriptView().getState();
const apply = (state: ScriptViewState, patch: (s: ScriptViewState) => Partial<ScriptViewState>): ScriptViewState => ({ ...state, ...patch(state) });

describe('search state changes', () => {
  it('a search is shown with its term, at the first match unless the menu chose another', () => {
    expect(apply(initial(), openFind('king')).find).toEqual({ open: true, q: 'king', i: 0 });
    expect(apply(initial(), openFind('king', 4)).find).toEqual({ open: true, q: 'king', i: 4 });
  });

  it('closes without losing the query', () => {
    const closed = apply(apply(initial(), openFind('queen')), closeFind);
    expect(closed.find).toMatchObject({ open: false, q: 'queen' });
  });

  it('steps with wrap in both directions and does nothing without matches', () => {
    let state = initial();
    state = apply(state, stepFind(-1, 3));
    expect(state.find.i).toBe(2);
    state = apply(state, stepFind(1, 3));
    expect(state.find.i).toBe(0);
    expect(stepFind(1, 0)(state)).toEqual({});
  });

  it('steps from the last match when the matches shrank under the index', () => {
    const state = apply(initial(), openFind('queen', 9));
    expect(apply(state, stepFind(1, 3)).find.i).toBe(0);
  });
});

describe('escapeClosesFind', () => {
  const opened = apply(initial(), openFind('queen'));
  it('closes the search only when nothing else is open', () => {
    expect(escapeClosesFind(opened, false)).toBe(true);
    expect(escapeClosesFind(opened, true)).toBe(false);
    expect(escapeClosesFind({ ...opened, drawer: 'rail' }, false)).toBe(false);
    expect(escapeClosesFind(initial(), false)).toBe(false);
  });
});
