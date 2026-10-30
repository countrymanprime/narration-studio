// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSpacer } from './Table';

afterEach(cleanup);

function renderTable({
  onActivate = () => undefined,
  onSort = () => undefined,
  sorted,
  selected = false,
}: {
  onActivate?: () => void;
  onSort?: () => void;
  sorted?: 'ascending' | 'descending';
  selected?: boolean;
} = {}) {
  render(
    <Table label="Discrepancies">
      <TableHead sticky>
        <TableRow>
          <TableHeader sorted={sorted} onSort={onSort}>
            Script
          </TableHeader>
          <TableHeader>Time</TableHeader>
          <TableHeader hiddenLabel="Actions" />
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow onActivate={onActivate} selected={selected}>
          <TableCell>wonder</TableCell>
          <TableCell align="right">0:04</TableCell>
          <TableCell>
            <button type="button">Play</button>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={3}>Plain row</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table', () => {
  it('is a named table with column headers, rows and cells', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Discrepancies' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: /^Script/ }).getAttribute('scope')).toBe('col');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: 'Plain row' }).getAttribute('colspan')).toBe('3');
  });

  it('announces the sort of a sortable column, and none for a column that is not sorted', () => {
    renderTable({ sorted: 'ascending' });
    expect(screen.getByRole('columnheader', { name: /^Script/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: 'Time' }).getAttribute('aria-sort')).toBeNull();
    cleanup();
    renderTable({ sorted: 'descending' });
    expect(screen.getByRole('columnheader', { name: /^Script/ }).getAttribute('aria-sort')).toBe('descending');
    cleanup();
    renderTable();
    expect(screen.getByRole('columnheader', { name: /^Script/ }).getAttribute('aria-sort')).toBe('none');
  });

  it('names the sort button by the label alone and draws the direction beside it', async () => {
    const onSort = vi.fn();
    renderTable({ sorted: 'descending', onSort });
    const button = screen.getByRole('button', { name: 'Script' });
    expect(button.textContent).toContain('↓');
    await userEvent.setup().click(button);
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it('activates a pressable row by click, Enter and Space, and gives it a tab stop', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    renderTable({ onActivate });
    const row = screen.getByRole('row', { name: /wonder/ });
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.hasAttribute('data-row')).toBe(true);
    await user.click(screen.getByRole('cell', { name: 'wonder' }));
    row.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('does not take a key press on a control inside the row as a press on the row', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    renderTable({ onActivate });
    screen.getByRole('button', { name: 'Play' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does not take a pointer press on a control inside the row, or on something inside that control, as a press on the row', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    renderTable({ onActivate });
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onActivate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('cell', { name: '0:04' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('names a column with no visible header for a screen reader', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
  });

  it('marks the selected row and leaves a plain row alone', () => {
    renderTable({ selected: true });
    expect(screen.getByRole('row', { name: /wonder/ }).getAttribute('aria-selected')).toBe('true');
    const plain = screen.getByRole('row', { name: 'Plain row' });
    expect(plain.getAttribute('tabindex')).toBeNull();
    expect(plain.hasAttribute('aria-selected')).toBe(false);
  });

  it('aligns a numeric column to the right in its cells, under a centred header', () => {
    renderTable();
    expect(screen.getByRole('cell', { name: '0:04' }).className).toContain('text-right');
    expect(screen.getByRole('columnheader', { name: 'Time' }).className).toContain('text-center');
  });

  it('is its own containing block, so a hidden label cannot escape it', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Actions' }).className).toContain('relative');
  });
  // The mock fidelity spec (measured on benchmark mocks 01 and 05):
  // a 31 px header and 34 px rows, taken from the size tokens, with the label type the mocks draw.
  it('sizes the header row and the body rows from the row tokens', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: 'Time' }).className;
    expect(header).toContain('h-[var(--header-row-height)]');
    expect(header).toContain('text-[length:var(--font-size-label)]');
    expect(header).toContain('tracking-[var(--tracking-label)]');
    expect(screen.getByRole('cell', { name: '0:04' }).className).toContain('h-[var(--row-height)]');
  });

  it('sits a cell in the middle of its row, and at the top on request for a multi-line cell', () => {
    render(
      <Table label="Cells">
        <TableBody>
          <TableRow>
            <TableCell>middle</TableCell>
            <TableCell valign="top">top</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('cell', { name: 'middle' }).className).toContain('align-middle');
    expect(screen.getByRole('cell', { name: 'top' }).className).toContain('align-top');
    expect(screen.getByRole('cell', { name: 'top' }).className).not.toContain('align-middle');
  });

  it('draws a numeric cell in mono, right-aligned and unbroken, and a muted cell smaller in the muted text colour', () => {
    render(
      <Table label="Cells">
        <TableBody>
          <TableRow>
            <TableCell numeric>12:05</TableCell>
            <TableCell muted>Proofer</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const numeric = screen.getByRole('cell', { name: '12:05' }).className;
    expect(numeric).toContain('IBM_Plex_Mono');
    expect(numeric).toContain('text-right');
    expect(numeric).toContain('whitespace-nowrap');
    const muted = screen.getByRole('cell', { name: 'Proofer' }).className;
    expect(muted).toContain('text-[var(--text-muted)]');
    expect(muted).toContain('text-[0.75rem]');
  });

  it('fills a selected row with the row-selected token, and draws the current row in bold without a fill', () => {
    render(
      <Table label="Rows">
        <TableBody>
          <TableRow onActivate={() => undefined} selected>
            <TableCell>picked</TableCell>
          </TableRow>
          <TableRow emphasis="current">
            <TableCell>now</TableCell>
          </TableRow>
          <TableRow emphasis="highlight">
            <TableCell>failing</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('row', { name: 'picked' }).className).toContain('bg-[var(--row-selected)]');
    const current = screen.getByRole('row', { name: 'now' });
    expect(current.className).toContain('font-semibold');
    expect(current.className).not.toContain('bg-');
    const highlight = screen.getByRole('row', { name: 'failing' });
    expect(highlight.className).toContain('bg-[var(--row-selected)]');
    // A highlight is the look alone: it is not a selection a screen reader should hear.
    expect(highlight.hasAttribute('aria-selected')).toBe(false);
  });

  it('sets the body text at 14 px, and a flush table reaches the edges of the panel it sits in', () => {
    render(
      <>
        <Table label="Inset">
          <TableBody>
            <TableRow>
              <TableCell>a</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Table label="Flush" flush>
          <TableBody>
            <TableRow>
              <TableCell>b</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    );
    const inset = screen.getByRole('table', { name: 'Inset' }).className;
    expect(inset).toContain('text-[0.875rem]');
    expect(inset).not.toContain('-mx-');
    expect(screen.getByRole('table', { name: 'Flush' }).className).toContain('-mx-[var(--panel-pad,1rem)]');
  });
});

// Alignment audit cause D: tables sized their columns by content, so columns moved between states, and a table at a card's
// edge started its text 6 to 10 px inside the card title, its last rule doubling the card's border.
describe('Table columns and edges', () => {
  const twoColumns = (props: { flush?: boolean; columns?: readonly string[] }) =>
    render(
      <Table label="Chapters" {...props}>
        <TableBody>
          <TableRow>
            <TableCell>Down the Rabbit-Hole</TableCell>
            <TableCell numeric>11:48</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

  it('fixes the column widths from `columns`, one col each, `auto` taking the rest', () => {
    twoColumns({ columns: ['auto', '6rem'] });
    const table = screen.getByRole('table', { name: 'Chapters' });
    expect(table.className).toContain('table-fixed');
    const cols = [...table.querySelectorAll('colgroup > col')] as HTMLElement[];
    expect(cols.map((col) => col.style.width)).toEqual(['', '6rem']);
  });

  it('lays out from the content and draws no colgroup without `columns`', () => {
    twoColumns({});
    const table = screen.getByRole('table', { name: 'Chapters' });
    expect(table.className).not.toContain('table-fixed');
    expect(table.querySelector('colgroup')).toBeNull();
  });

  it('insets the outer cells to the card edge and drops the last rule in a flush table', () => {
    twoColumns({ flush: true });
    const flush = screen.getByRole('table', { name: 'Chapters' }).className;
    expect(flush).toContain('[&_tr>:first-child]:pl-4');
    expect(flush).toContain('[&_tr>:last-child]:pr-4');
    expect(flush).toContain('[&>tbody>tr:last-child>*]:border-b-0');
    cleanup();
    // Any other table follows the panel body's padding: 16 px in a `Panel flush`, the ordinary 10 px in a padded body.
    twoColumns({});
    const plain = screen.getByRole('table', { name: 'Chapters' }).className;
    expect(plain).toContain('[&_tr>:first-child]:pl-[max(0.625rem,calc(1rem-var(--panel-pad,1rem)))]');
    expect(plain).toContain('[&>tbody>tr:last-child>*]:border-b-[min(1px,var(--panel-pad,1rem))]');
  });
});

describe('a table that moves focus between its rows', () => {
  function renderNavigable(onKeyDown?: () => void) {
    render(
      <Table label="Entries">
        <TableBody navigable onKeyDown={onKeyDown}>
          {['a', 'b', 'c'].map((id, index) => (
            <TableRow key={id} onActivate={() => undefined} tabStop={index === 1}>
              <TableCell>
                {id} <button type="button">act {id}</button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>,
    );
    return screen.getAllByRole('row');
  }

  it('gives one row the tab stop and the others none', () => {
    const rows = renderNavigable();
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves focus with Up and Down and stops at the ends', async () => {
    const rows = renderNavigable();
    rows[1]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[2]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[2]);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('jumps to the first and last rendered row with Home and End', async () => {
    const rows = renderNavigable();
    rows[1]!.focus();
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(rows[2]);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('leaves the arrow keys to a control inside a row', async () => {
    const rows = renderNavigable();
    const button = screen.getByRole('button', { name: 'act b' });
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(button);
    expect(rows).toHaveLength(3);
  });

  it('passes every key to the caller too', async () => {
    const onKeyDown = vi.fn();
    const rows = renderNavigable(onKeyDown);
    rows[1]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});

describe('a table that draws only some of its rows', () => {
  it('says how many rows there are and which one each drawn row is', () => {
    render(
      <Table label="Entries" rowCount={500}>
        <TableBody>
          <TableRow rowIndex={300}>
            <TableCell>x</TableCell>
          </TableRow>
          <TableRow rowIndex={301} onActivate={() => undefined}>
            <TableCell>y</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('500');
    expect(screen.getAllByRole('row').map((row) => row.getAttribute('aria-rowindex'))).toEqual(['300', '301']);
  });
});

describe('the spacer that holds the place of undrawn rows', () => {
  it('is as tall as the rows it stands for, spans the columns and is hidden from a screen reader', () => {
    render(
      <Table label="Entries">
        <TableBody>
          <TableSpacer height={390} columns={3} />
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const spacer = document.querySelector<HTMLElement>('tr[aria-hidden="true"]')!;
    expect(spacer.style.height).toBe('390px');
    expect(spacer.querySelector('td')!.getAttribute('colspan')).toBe('3');
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });
});

describe('a table on the text edge of a padded card', () => {
  it("starts its first column and ends its last on the card's text edge, not 10 px in (SBX-13)", () => {
    render(
      <Table label="Properties" textEdges>
        <TableBody>
          <TableRow>
            <TableCell>Age</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Properties' });
    expect(table.className).toContain('[&_tr>:first-child]:pl-0');
    expect(table.className).toContain('[&_tr>:last-child]:pr-0');
    expect(table.className).not.toContain('pl-[max(0.625rem');
  });
});

describe('TableHeader alignment (owner rule 5, #2641)', () => {
  it('centres every header, whatever the column holds', () => {
    renderTable();
    for (const th of screen.getAllByRole('columnheader')) expect(th.className).toMatch(/(^|\s)text-center(\s|$)/);
    for (const th of screen.getAllByRole('columnheader')) expect(th.className).not.toMatch(/text-(left|right)/);
  });
});
