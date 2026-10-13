// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { NotesPanel } from './NotesPanel';
import type { NoteSort, NoteWindow } from './noteRows';
import { notesFixture } from './testNotes';

afterEach(cleanup);

function Harness({
  all = true,
  window,
  onSort = () => {},
  findings = notesFixture(),
}: {
  all?: boolean;
  window?: NoteWindow;
  onSort?: (s: NoteSort) => void;
  findings?: ReturnType<typeof notesFixture>;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [sort, setSort] = useState<NoteSort>('time');
  return (
    <TooltipProvider>
      <NotesPanel
        findings={findings}
        allChapters={all}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          onSort(s);
        }}
        selectedId={sel}
        onSelect={setSel}
        window={window}
        badge={(row) => <span data-testid="badge">{row.id}</span>}
      />
    </TooltipProvider>
  );
}

const dataRows = () => screen.queryAllByRole('row').filter((r) => r.hasAttribute('data-row'));

// Issue 1718: a narrow window scrolls the table sideways inside its panel instead of squeezing Script vs heard to a word a line.
describe('the-notes-table-scrolls-instead-of-squeezing', () => {
  it('keeps a width of its own inside a scroll region the keyboard can reach', () => {
    render(<Harness />);
    const region = screen.getByRole('group', { name: 'Notes scroll area' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('overflow-auto');
    expect(within(region).getByRole('table', { name: 'Notes' }).className).toMatch(/min-w-\[\d+rem\]/);
  });
});

describe('all-chapters-groups-by-chapter-with-open-count', () => {
  it('draws a group row per chapter with its open count', () => {
    render(<Harness />);
    expect(screen.getByText('Chapter 1').parentElement!.textContent).toContain('3 open');
    expect(screen.getByText('Chapter 2').parentElement!.textContent).toContain('1 open');
  });
  it('draws no group rows for one chapter', () => {
    render(<Harness all={false} />);
    expect(screen.queryByText(/ open$/)).toBeNull();
  });
});

describe('sort-changes-the-order', () => {
  it('reports the choice and names the active sort', async () => {
    const onSort = vi.fn();
    render(<Harness onSort={onSort} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort notes' }), 'severity');
    expect(onSort).toHaveBeenCalledWith('severity');
    expect((screen.getByRole('option', { name: 'By severity' }) as HTMLOptionElement).selected).toBe(true);
  });
});

describe('chips-filter-and-count', () => {
  it('filters, counts, carries aria-pressed and clears from the empty state', async () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Filter notes' });
    expect(
      within(group)
        .getByRole('button', { name: /^Open\s+4$/ })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.getByRole('heading', { name: 'Notes · 5' })).toBeTruthy();
    await userEvent.click(within(group).getByRole('button', { name: /^Pickups/ }));
    expect(
      within(group)
        .getByRole('button', { name: /^Pickups/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'Notes · 1 of 5' })).toBeTruthy();
    expect(dataRows()).toHaveLength(1);
    await userEvent.click(within(group).getByRole('button', { name: /^To review/ }));
    await userEvent.click(within(group).getByRole('button', { name: /^Decided/ }));
    expect(dataRows()).toHaveLength(4);
  });
  it('shows No notes match with Clear filters, and No notes for this chapter when empty', async () => {
    render(<Harness findings={notesFixture().filter((f) => f.id === 'a')} />);
    await userEvent.click(screen.getByRole('button', { name: /^Pickups/ }));
    expect(screen.getByRole('heading', { name: 'No notes match' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(dataRows()).toHaveLength(1);
    cleanup();
    render(<Harness findings={[]} />);
    expect(screen.getByRole('heading', { name: 'No notes for this chapter' })).toBeTruthy();
  });
});

describe('in-view-chip-only-when-the-window-is-narrower', () => {
  it('is absent for the whole chapter, and on by default otherwise, filtering to the window (mock `winFilter: true`)', async () => {
    const { rerender } = render(<Harness all={false} window={{ start: 0, len: 760, total: 760 }} />);
    expect(screen.queryByRole('button', { name: 'In view' })).toBeNull();
    const all = dataRows().length;
    rerender(<Harness all={false} window={{ start: 10, len: 100, total: 760 }} />);
    expect(screen.getByRole('button', { name: 'In view' }).getAttribute('aria-pressed')).toBe('true');
    expect(dataRows()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'In view' }));
    expect(dataRows()).toHaveLength(all);
  });
});

describe('find-in-notes-filters-script-and-heard', () => {
  it('opens on Ctrl+F, filters, and closes and clears on Escape', async () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox', { name: 'Find in notes' })).toBeNull();
    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    const field = await screen.findByRole('textbox', { name: 'Find in notes' });
    await userEvent.type(field, 'ROWAN');
    expect(dataRows()).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Find in notes' })).toBeNull();
    expect(dataRows()).toHaveLength(5);
  });
});

describe('sources-line-names-the-analyzers', () => {
  it('names the analyzers of every note in scope, before the filters (mock `sourcesOf(base)`)', async () => {
    render(<Harness />);
    expect(screen.getByText('Sources: Local AI compare 4 · Delivery measurement 1')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Pickups/ }));
    expect(screen.getByText('Sources: Local AI compare 4 · Delivery measurement 1')).toBeTruthy();
  });
});

describe('selection-and-keys', () => {
  it('moves with the arrows and J/K, selects with Enter, keeps one row in the tab order', async () => {
    render(<Harness />);
    expect(dataRows().filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await userEvent.click(dataRows()[0]);
    expect(dataRows()[0].getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowDown}');
    expect(dataRows()[1].getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('j');
    expect(dataRows()[2].getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('k{ArrowUp}');
    expect(dataRows()[0].getAttribute('aria-selected')).toBe('true');
    expect(dataRows().filter((r) => r.tabIndex === 0)).toEqual([dataRows()[0]]);
    dataRows()[3].focus();
    await userEvent.keyboard('{Enter}');
    expect(dataRows()[3].getAttribute('aria-selected')).toBe('true');
  });
  it('leaves the keys to the find field while typing', async () => {
    render(<Harness />);
    await userEvent.click(dataRows()[0]);
    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Find in notes' }), 'jk');
    expect(dataRows()).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'No notes match' })).toBeTruthy();
  });
});

describe('type-and-resolution-chips-are-words-and-shapes', () => {
  it('reads each decision as a word', () => {
    render(<Harness />);
    for (const word of ['To review', 'Needs pickup', 'Fix in edit', 'Waive', 'Defer']) expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  });
  it('shows the confidence, or the reason on hover when there is none', () => {
    render(<Harness />);
    expect(screen.getByText('Local AI compare · 0.90')).toBeTruthy();
    expect(screen.getByText('Delivery measurement')).toBeTruthy();
  });
});

describe('takes-badge-slot', () => {
  it('draws the badge after the heard text only when given one', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getAllByTestId('badge')).toHaveLength(5);
    rerender(
      <TooltipProvider>
        <NotesPanel findings={notesFixture()} allChapters sort="time" onSortChange={() => {}} selectedId={null} onSelect={() => {}} />
      </TooltipProvider>,
    );
    expect(screen.queryAllByTestId('badge')).toHaveLength(0);
  });
});

describe('the page actions slot', () => {
  it('draws the page icons in the queue head, after find in notes', () => {
    render(
      <TooltipProvider>
        <NotesPanel
          findings={notesFixture()}
          allChapters
          sort="time"
          onSortChange={() => {}}
          selectedId={null}
          onSelect={() => {}}
          actions={<button type="button">Check recordings…</button>}
        />
      </TooltipProvider>,
    );
    const head = screen.getByRole('region', { name: 'Notes' });
    const names = within(head)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names.indexOf('Check recordings…')).toBe(names.indexOf('Find in notes') + 1);
  });
});
