import { describe, expect, it } from 'vitest';
import { createScriptView, type ScriptViewState } from '../../data/scriptView';
import { closeFind, escapeClosesFind, findCountText, openFind, pickFind, setFindQuery, stepFind, toggleFindList } from './findState';

const initial = () => createScriptView().getState();
const apply = (state: ScriptViewState, patch: (s: ScriptViewState) => Partial<ScriptViewState>): ScriptViewState => ({ ...state, ...patch(state) });

describe('find state changes', () => {
  it('opens with the list showing, and with a term it starts at the first match', () => {
    const typed = apply(apply(initial(), setFindQuery('queen')), stepFind(1, 3));
    const opened = apply(typed, openFind('king'));
    expect(opened.find).toEqual({ open: true, q: 'king', i: 0, list: true });
    expect(opened.findNonce).toBe(typed.findNonce + 1);
  });

  it('opens without a term keeping the query and match', () => {
    const typed = apply(apply(initial(), setFindQuery('queen')), stepFind(1, 3));
    const opened = apply(typed, openFind());
    expect(opened.find).toMatchObject({ open: true, q: 'queen', i: 1 });
  });

  it('closes without losing the query', () => {
    const closed = apply(apply(initial(), openFind('queen')), closeFind);
    expect(closed.find).toMatchObject({ open: false, q: 'queen' });
  });

  it('a new query starts at the first match with the list showing', () => {
    const picked = apply(apply(initial(), stepFind(1, 3)), pickFind(2));
    expect(picked.find).toMatchObject({ i: 2, list: false });
    expect(apply(picked, setFindQuery('x')).find).toMatchObject({ q: 'x', i: 0, list: true });
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
    const state = apply(initial(), pickFind(9));
    expect(apply(state, stepFind(1, 3)).find.i).toBe(0);
  });

  it('toggles the list', () => {
    const state = initial();
    expect(apply(state, toggleFindList).find.list).toBe(!state.find.list);
  });
});

describe('findCountText', () => {
  const find = (q: string, i = 0) => ({ open: true, q, i, list: true });
  it('says nothing under two characters, "n of m" with matches and "No matches" without', () => {
    expect(findCountText(find('q'), 5)).toBe('');
    expect(findCountText(find('queen', 2), 12)).toBe('3 of 12');
    expect(findCountText(find('queen', 40), 12)).toBe('12 of 12');
    expect(findCountText(find('zzzz'), 0)).toBe('No matches');
  });
});

describe('escapeClosesFind', () => {
  const opened = apply(initial(), openFind('queen'));
  it('closes Find only when nothing else is open', () => {
    expect(escapeClosesFind(opened, false)).toBe(true);
    expect(escapeClosesFind(opened, true)).toBe(false);
    expect(escapeClosesFind({ ...opened, drawer: 'rail' }, false)).toBe(false);
    expect(escapeClosesFind(initial(), false)).toBe(false);
  });
});
