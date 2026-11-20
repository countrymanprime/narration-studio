// @vitest-environment jsdom
// The Story Bible entry table: its headers sort and announce the sort, its rows are opened by click and Enter and share one tab stop that the arrow
// keys move, and a long book draws only the rows in view.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import { CommandRouter, CommandScope } from '../../input/router';
import type { GuideEntity, GuideType } from '../../types';
import { EntryTable, type EntryTableProps } from './EntryTable';
import { DEFAULT_SORT, sortRows } from './entryTableModel';

afterEach(cleanup);

const entry = (id: string, name: string, over: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name: name,
  aliases: [],
  category: 'Character',
  occurrences: [],
  occurrence_count: 3,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  ...over,
});
const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
];
const KINDS = TYPES.map((type) => type.name);

function setup(rows: GuideEntity[], over: Partial<EntryTableProps> = {}) {
  const props: EntryTableProps = {
    rows: sortRows(rows, DEFAULT_SORT, { kinds: KINDS, suggestions: [] }),
    types: TYPES,
    sort: DEFAULT_SORT,
    onSort: vi.fn(),
    onOpen: vi.fn(),
    onOpenLoose: vi.fn(),
    empty: 'No entries match.',
    ...over,
  };
  const view = render(
    <CommandRouter>
      <CommandScope kind="page">
        <EntryTable {...props} />
      </CommandScope>
    </CommandRouter>,
  );
  return { props, view };
}
const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('the-headers-sort-and-announce-the-sort', () => {
  // The Hear column is the redesign's third column (SNB-D3): named for a screen reader only, and never sorted.
  it('names the columns and marks the sorted one, the others none', () => {
    setup([entry('a', 'Alice')]);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent?.replace(/\s*[↑↓]$/, '').trim())).toEqual(['Name', 'Kind', 'Pronunciation']);
    expect(headers.map((header) => header.getAttribute('aria-sort'))).toEqual(['ascending', 'none', null]);
  });
  it('announces descending and moves with the sort it is given', () => {
    setup([entry('a', 'Alice')], {
      sort: [
        { column: 'kind', dir: 'desc' },
        { column: 'name', dir: 'asc' },
      ],
    });
    expect(screen.getByRole('columnheader', { name: /^Kind/ }).getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('columnheader', { name: /^Name/ }).getAttribute('aria-sort')).toBe('none');
  });
  it('reports the column pressed, from the mouse and the keyboard', async () => {
    const { props } = setup([entry('a', 'Alice')]);
    await userEvent.click(screen.getByRole('button', { name: 'Kind' }));
    screen.getByRole('button', { name: 'Name' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onSort).toHaveBeenNthCalledWith(1, 'kind');
    expect(props.onSort).toHaveBeenNthCalledWith(2, 'name');
  });
});

describe('a-row-per-entry', () => {
  it('shows the name and kind of each entry', () => {
    setup([
      entry('h', 'Hatter', {
        aliases: [{ text: 'Mad Hatter' }, { text: 'Tarrant' }] as GuideEntity['aliases'],
      }),
    ]);
    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual(['Hatter', 'Character', '']);
  });
  // #3380: the name and the kind are clipped to their cells, so each carries its whole text as a title.
  it('gives the clipped name, with its alias, and the kind their whole text as a title', () => {
    setup([entry('h', 'Hatter', { aliases: [{ text: 'Mad Hatter' }] as GuideEntity['aliases'] })]);
    const row = within(bodyRows()[0]!);
    expect(row.getByText('Character').getAttribute('title')).toBe('Character');
    expect(row.getAllByTitle(/^Hatter/).length).toBeGreaterThan(0);
  });

  it('draws the type colour beside the kind, amber for an entry whose kind is not set, and says so', () => {
    setup([entry('a', 'Alice'), entry('n', 'Nobody', { category: 'Needs Review' })]);
    const [alice, nobody] = bodyRows().map((row) => within(row).getAllByRole('cell'));
    expect(alice![1]!.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.background).toBe('var(--character)');
    expect(nobody![1]!.textContent).toBe('Type not set');
    expect(nobody![1]!.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.background).toBe('var(--warn)');
  });
  it('reads a name in its own direction and keeps emoji', () => {
    setup([entry('r', 'أليس'), entry('e', '🐇 Rabbit')]);
    const names = bodyRows().map((row) => within(row).getAllByRole('cell')[0]!.querySelector('[dir]')!);
    expect(names.map((name) => [name.getAttribute('dir'), name.textContent])).toEqual([
      ['auto', '🐇 Rabbit'],
      ['auto', 'أليس'],
    ]);
  });
  it('truncates a very long name instead of widening the table', () => {
    setup([entry('l', 'W'.repeat(400))]);
    expect(within(bodyRows()[0]!).getAllByRole('cell')[0]!.querySelector('[data-entry-name]')!.parentElement!.className).toContain('truncate');
  });
  it('says what the caller says when no row is drawn', () => {
    setup([], { empty: <span>No entries match.</span> });
    expect(screen.getByText('No entries match.')).toBeTruthy();
    expect(screen.queryAllByRole('row')).toHaveLength(2);
  });
});

describe('opening-an-entry', () => {
  it('opens by click and by Enter, and marks the open entry selected', async () => {
    const { props } = setup([entry('a', 'Alice'), entry('b', 'Bob')], { openId: 'b' });
    expect(bodyRows().map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    await userEvent.click(bodyRows()[0]!);
    expect(props.onOpen).toHaveBeenLastCalledWith('a');
    bodyRows()[1]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onOpen).toHaveBeenLastCalledWith('b');
  });
  it('carries the entry id for the right-click menu', () => {
    setup([entry('a', 'Alice')]);
    expect(bodyRows()[0]!.getAttribute('data-entry-id')).toBe('a');
  });
});

describe('keyboard-navigation', () => {
  const four = [entry('a', 'Ann'), entry('b', 'Bea'), entry('c', 'Cy'), entry('d', 'Di')];
  it('has one tab stop, on the open entry, else the first', () => {
    const { view } = setup(four, { openId: 'c' });
    expect(bodyRows().map((row) => row.tabIndex)).toEqual([-1, -1, 0, -1]);
    view.unmount();
    setup(four);
    expect(bodyRows().map((row) => row.tabIndex)).toEqual([0, -1, -1, -1]);
  });
  it('moves the tab stop to the row focus rests on', async () => {
    setup(four);
    bodyRows()[1]!.focus();
    await waitFor(() => expect(bodyRows().map((row) => row.tabIndex)).toEqual([-1, 0, -1, -1]));
  });
  it('steps with the arrow keys, goes to the ends with Home and End, and stops at the ends', async () => {
    setup(four);
    bodyRows()[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(bodyRows()[1]);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(bodyRows()[3]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(bodyRows()[3]);
    await userEvent.keyboard('{Home}{ArrowUp}');
    expect(document.activeElement).toBe(bodyRows()[0]);
  });
  it('does not open an entry by moving over it', async () => {
    const { props } = setup(four);
    bodyRows()[0]!.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(props.onOpen).not.toHaveBeenCalled();
  });
  it('steps from the open entry when focus is elsewhere, by the page-scope commands', async () => {
    setup(four, { openId: 'b' });
    document.body.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(bodyRows()[2]);
  });
});

describe('suggestions-with-no-entry-yet', () => {
  const loose = [
    { id: 'x1', entryId: null, status: 'needs-verification', confidence: 0.8, payload: { kind: 'entry', name: 'Dormouse', type: 'Character' } },
  ] as unknown as ExtractionSuggestion[];
  it('lists them above the entries and opens one by click', async () => {
    const { props } = setup([entry('a', 'Alice')], { loose });
    const rows = bodyRows();
    expect(rows[0]!.getAttribute('data-loose')).toBe('x1');
    expect(rows[0]!.textContent).toContain('not in the Story Bible yet');
    await userEvent.click(rows[0]!);
    expect(props.onOpenLoose).toHaveBeenCalledWith('x1');
  });
  it('marks the chosen one selected and gives it the tab stop', () => {
    setup([entry('a', 'Alice')], { loose, looseId: 'x1' });
    expect(bodyRows().map((row) => [row.getAttribute('aria-selected'), row.tabIndex])).toEqual([
      ['true', 0],
      ['false', -1],
    ]);
  });
});

describe('a-book-of-hundreds', () => {
  const many = Array.from({ length: 500 }, (_, index) => entry(`id${String(index).padStart(3, '0')}`, `Entry ${String(index).padStart(3, '0')}`));
  it('draws only the rows in view and says how many there are', () => {
    setup(many);
    expect(bodyRows().length).toBeLessThan(80);
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('501');
    expect(bodyRows()[0]!.getAttribute('aria-rowindex')).toBe('2');
  });
  it('End reaches the last entry, which was not drawn, and Home comes back', async () => {
    setup(many);
    bodyRows()[0]!.focus();
    await userEvent.keyboard('{End}');
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('data-entry-id')).toBe('id499'));
    expect(bodyRows().length).toBeLessThan(80);
    await userEvent.keyboard('{Home}');
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('data-entry-id')).toBe('id000'));
  });
  it('keeps the focused row drawn while the list scrolls away from it', async () => {
    const { view } = setup(many);
    bodyRows()[2]!.focus();
    const scroller = view.container.querySelector<HTMLElement>('[data-entry-scroll]')!;
    scroller.scrollTop = 30000;
    scroller.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(screen.queryByText('Entry 120')).not.toBeNull());
    expect(document.activeElement?.getAttribute('data-entry-id')).toBe('id002');
  });
  it('draws a small book whole', () => {
    setup(many.slice(0, 100));
    expect(bodyRows()).toHaveLength(100);
  });
});

describe('a-row-plays-its-pronunciation', () => {
  const said = { ipa: 'ˈælɪs', source: 'manual', confidence: '' };
  const rows = () => [entry('a', 'Alice', { pronunciation: said }), entry('b', 'Bill')];

  it('shows Hear only on an entry with a pronunciation, out of the tab order', () => {
    setup(rows(), { onHear: vi.fn() });
    const hear = screen.getAllByRole('button', { name: /^Hear/ });
    expect(hear.map((button) => button.getAttribute('aria-label'))).toEqual(['Hear Alice']);
    expect(hear[0]!.tabIndex).toBe(-1);
  });
  it('plays on a press without opening the entry', async () => {
    const { props } = setup(rows(), { onHear: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Hear Alice' }));
    expect(props.onHear).toHaveBeenCalledWith('a');
    expect(props.onOpen).not.toHaveBeenCalled();
  });
  it('plays on Space on a row that has one, and opens on Space on a row that has none', async () => {
    const { props } = setup(rows(), { onHear: vi.fn() });
    const [alice, bill] = bodyRows();
    alice!.focus();
    await userEvent.keyboard(' ');
    expect(props.onHear).toHaveBeenCalledWith('a');
    expect(props.onOpen).not.toHaveBeenCalled();
    bill!.focus();
    await userEvent.keyboard(' ');
    expect(props.onOpen).toHaveBeenCalledWith('b');
    expect(props.onHear).toHaveBeenCalledTimes(1);
  });
  it('says which one is playing and which one is loading', () => {
    setup([entry('a', 'Alice', { pronunciation: said }), entry('c', 'Cat', { pronunciation: said })], { onHear: vi.fn(), playingId: 'a', loadingId: 'c' });
    expect(screen.getByRole('button', { name: 'Stop Alice' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hear Cat' }).getAttribute('aria-busy')).toBe('true');
  });
  it('draws no Hear at all without a player', () => {
    setup(rows());
    expect(screen.queryByRole('button', { name: /^Hear/ })).toBeNull();
  });
});

// #3662: ticking rows. A column of boxes before the name, a select-all box, and a bar that takes the header row while any row is ticked.
describe('ticking-rows', () => {
  const ROWS = [entry('e1', 'Ann'), entry('e2', 'Bea'), entry('e3', 'Cy', { category: 'Place' })];
  const withSelection = (ticked: string[], over: Partial<NonNullable<EntryTableProps['selection']>> = {}) => ({
    ticked: new Set(ticked),
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    bar: <span data-bar="">Delete</span>,
    ...over,
  });

  it('draws no column of boxes without a selection, and one box a row with it', () => {
    const { view } = setup(ROWS);
    expect(screen.queryByRole('checkbox')).toBeNull();
    view.unmount();
    setup(ROWS, { selection: withSelection([]) });
    expect(screen.getAllByRole('checkbox')).toHaveLength(ROWS.length + 1);
    expect(screen.getByRole('checkbox', { name: 'Select Ann' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select every entry' })).toBeTruthy();
  });

  it('ticks a row with its box and opens nothing; a press with Shift asks for the range', async () => {
    const selection = withSelection([]);
    const { props } = setup(ROWS, { selection });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Bea' }));
    expect(selection.onToggle).toHaveBeenLastCalledWith('e2', false);
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Cy' }));
    await user.keyboard('{/Shift}');
    expect(selection.onToggle).toHaveBeenLastCalledWith('e3', true);
    expect(props.onOpen, 'a press on a box opens no entry').not.toHaveBeenCalled();
  });

  it('Space on a box ticks the row and neither plays nor opens it', async () => {
    const onHear = vi.fn();
    const selection = withSelection([]);
    const { props } = setup([entry('e1', 'Ann', { pronunciation: { ipa: 'an', source: 'user', confidence: '' } })], { selection, onHear });
    const box = screen.getByRole('checkbox', { name: 'Select Ann' });
    box.focus();
    await userEvent.setup().keyboard(' ');
    expect(selection.onToggle).toHaveBeenCalledWith('e1', false);
    expect(onHear).not.toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('shows the select-all box ticked, mixed or off by what is ticked, and asks to tick or clear all', async () => {
    const selection = withSelection(['e1']);
    const { view } = setup(ROWS, { selection });
    const all = () => screen.getByRole('checkbox', { name: 'Select every entry' });
    expect(all().getAttribute('aria-checked')).toBe('mixed');
    await userEvent.setup().click(all());
    expect(selection.onToggleAll).toHaveBeenCalledTimes(1);
    view.unmount();
    setup(ROWS, { selection: withSelection(['e1', 'e2', 'e3']) });
    expect(all().getAttribute('aria-checked')).toBe('true');
  });

  it('puts the bar in the header row while a row is ticked, in place of the sort buttons, and takes it away when none is', () => {
    const { view } = setup(ROWS, { selection: withSelection([]) });
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeTruthy();
    expect(document.querySelector('[data-bar]')).toBeNull();
    view.unmount();
    setup(ROWS, { selection: withSelection(['e2']) });
    expect(document.querySelector('thead [data-bar]')).not.toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Name/ })).toBeNull();
    // One header row either way, so the rows below it do not move.
    expect(document.querySelectorAll('thead tr')).toHaveLength(1);
  });

  it('keeps one tab stop: only the box of the row that holds it is in the Tab order', () => {
    setup(ROWS, { selection: withSelection([]) });
    const stops = screen.getAllByRole('checkbox', { name: /^Select (Ann|Bea|Cy)$/ }).filter((box) => box.getAttribute('tabindex') !== '-1');
    expect(stops).toHaveLength(1);
  });

  it('draws a loose suggestion with an empty first cell, so its row lines up with the entries', () => {
    const loose = [{ id: 'l1', payload: { kind: 'entity', name: 'Zed', category: 'Character' } }] as unknown as ExtractionSuggestion[];
    setup(ROWS, { selection: withSelection([]), loose });
    const row = document.querySelector('[data-loose]')!;
    expect(row.querySelectorAll('td').length + [...row.querySelectorAll('td')].reduce((n, td) => n + (td.colSpan - 1), 0)).toBe(4);
  });
});
