// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScriptView, type ScriptViewState } from '../../data/scriptView';
import { FindBar } from './FindBar';
import { closeFind, openFind, pickFind, setFindQuery, stepFind, toggleFindList } from './findState';
import { searchManuscript } from './searchManuscript';

afterEach(cleanup);

const PARAGRAPHS = [
  { id: 'p1', chapterId: 'c1', text: 'The queen said nothing to the queen.' },
  { id: 'p2', chapterId: 'c2', text: 'A third queen waited.' },
];

let open: (term?: string) => void;
let state: () => ScriptViewState;

/** The bar over a real view state, as `useFind` binds it, with the reader's focus target beside it. */
function Harness({ returnFocus = () => {} }: { returnFocus?: () => void }) {
  const [view, setView] = useState(() => createScriptView().getState());
  const apply = (patch: (s: ScriptViewState) => Partial<ScriptViewState>) => setView((s) => ({ ...s, ...patch(s) }));
  state = () => view;
  open = (term) => apply(openFind(term));
  const matches = searchManuscript(PARAGRAPHS, view.find.q);
  return (
    <>
      <div id="reader" tabIndex={-1} />
      <FindBar
        find={view.find}
        nonce={view.findNonce}
        matches={matches}
        locationOf={(match) => match.chapterId}
        onQuery={(q) => apply(setFindQuery(q))}
        onStep={(delta) => apply(stepFind(delta, matches.length))}
        onPick={(i) => apply(pickFind(i))}
        onToggleList={() => apply(toggleFindList)}
        onClose={() => apply(closeFind)}
        returnFocus={() => {
          document.getElementById('reader')?.focus();
          returnFocus();
        }}
      />
    </>
  );
}

const field = () => screen.getByRole('textbox', { name: 'Find in the manuscript' });

describe('find-highlights-counts-steps-and-closes', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('counts the matches, steps with wrap on Enter and Shift+Enter, and says when there are none', () => {
    render(<Harness />);
    act(() => open('queen'));
    expect(field()).toHaveProperty('value', 'queen');
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('2 of 3');
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    fireEvent.change(field(), { target: { value: 'zzzz' } });
    expect(screen.getByRole('status').textContent).toBe('No matches');
  });

  it('searches nothing under two characters', async () => {
    render(<Harness />);
    act(() => open());
    await userEvent.type(field(), 'q');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /queen/ })).toBeNull();
  });

  it('takes focus on open and again each time Find is asked for', () => {
    render(<Harness />);
    act(() => open('queen'));
    expect(document.activeElement).toBe(field());
    (document.getElementById('reader') as HTMLElement).focus();
    act(() => open('queen'));
    expect(document.activeElement).toBe(field());
  });

  it('closes on Escape and on the close button, and returns focus to the reader', async () => {
    const returned = vi.fn();
    render(<Harness returnFocus={returned} />);
    act(() => open('queen'));
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(state().find.open).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('reader'));
    expect(returned).toHaveBeenCalledTimes(1);
    act(() => open('queen'));
    await userEvent.click(screen.getByRole('button', { name: /Close search/ }));
    expect(state().find.open).toBe(false);
    expect(returned).toHaveBeenCalledTimes(2);
  });

  it('steps with the previous and next buttons', async () => {
    render(<Harness />);
    act(() => open('queen'));
    await userEvent.click(screen.getByRole('button', { name: /Next match/ }));
    expect(screen.getByRole('status').textContent).toBe('2 of 3');
    await userEvent.click(screen.getByRole('button', { name: /Previous match/ }));
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
  });
});

describe('find-lists-results-and-picking-one-makes-it-current', () => {
  it('lists each result with its location and snippet, the current one marked', () => {
    render(<Harness />);
    act(() => open('queen'));
    const rows = screen.getAllByRole('button', { name: /queen/ });
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('c1');
    expect(rows[0]?.getAttribute('aria-current')).toBe('true');
    expect(rows[1]?.getAttribute('aria-current')).toBeNull();
    expect(rows[2]?.querySelector('mark')?.textContent).toBe('queen');
  });

  it('choosing a result makes it current, hides the list and returns focus; focusing the box shows it again', async () => {
    render(<Harness />);
    act(() => open('queen'));
    await userEvent.click(screen.getAllByRole('button', { name: /queen/ })[2] as HTMLElement);
    expect(state().find).toMatchObject({ i: 2, list: false });
    expect(screen.queryAllByRole('button', { name: /queen/ })).toHaveLength(0);
    expect(document.activeElement).toBe(document.getElementById('reader'));
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
    act(() => field().focus());
    expect(state().find.list).toBe(true);
    expect(screen.getAllByRole('button', { name: /queen/ })).toHaveLength(3);
  });

  it('the results button toggles the list', async () => {
    render(<Harness />);
    act(() => open('queen'));
    await userEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.queryAllByRole('button', { name: /queen/ })).toHaveLength(0);
  });

  it('draws 80 results and says how many more', () => {
    const many = Array.from({ length: 90 }, (_, n) => ({ id: `p${n}`, chapterId: 'c', text: 'queen' }));
    const matches = searchManuscript(many, 'queen');
    render(
      <FindBar
        find={{ open: true, q: 'queen', i: 0, list: true }}
        nonce={0}
        matches={matches}
        locationOf={() => 'c'}
        onQuery={() => {}}
        onStep={() => {}}
        onPick={() => {}}
        onToggleList={() => {}}
        onClose={() => {}}
        returnFocus={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: /queen/ })).toHaveLength(80);
    expect(screen.getByText('10 more. Refine your search.')).toBeTruthy();
  });
});
