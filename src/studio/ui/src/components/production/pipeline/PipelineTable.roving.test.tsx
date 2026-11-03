// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { PipelineTable } from './PipelineTable';
import { buildPipelineRows } from './pipelineRows';
import { useRovingCells } from './useRovingCells';
import { chapter, MID_BOOK, MID_BOOK_RECOMMENDATIONS, MID_BOOK_SOURCES } from './pipelineFixtures';

afterEach(cleanup);
const noop = () => undefined;

function mount() {
  return render(
    <TooltipProvider>
      <button type="button">before</button>
      <PipelineTable
        rows={buildPipelineRows(MID_BOOK, MID_BOOK_SOURCES)}
        recommendations={MID_BOOK_RECOMMENDATIONS}
        onGo={noop}
        notify={noop}
        onStatus={noop}
      />
      <button type="button">after</button>
    </TooltipProvider>,
  );
}
const controls = () => [...document.querySelectorAll<HTMLElement>('tbody button')];
const rowOf = (element: Element) => (element.closest('tr') as HTMLTableRowElement).dataset.chapterId;

describe('PipelineTable keyboard: one tab stop, arrows inside (#2883)', () => {
  it('has exactly one control in the Tab order, however many cells there are', () => {
    mount();
    expect(controls().length).toBeGreaterThan(20);
    expect(controls().filter((control) => control.tabIndex === 0)).toHaveLength(1);
  });

  it('Tab enters the table once and the next Tab leaves it for what follows', async () => {
    mount();
    const user = userEvent.setup();
    await user.click(document.body);
    await user.tab(); // before
    // The scroll area and the two column-info marks in the header come first; then the cells' one stop.
    for (let step = 0; step < 6 && !document.activeElement!.closest('tbody'); step++) await user.tab();
    expect(document.activeElement!.closest('tbody')).not.toBeNull();
    await user.tab();
    expect(document.activeElement!.textContent).toBe('after');
    await user.tab({ shift: true });
    expect(document.activeElement!.closest('tbody')).not.toBeNull();
  });

  it('moves along a row with Left and Right, and between rows in the same column with Up and Down', async () => {
    mount();
    const user = userEvent.setup();
    const first = controls()[0]!;
    first.focus();
    const row = rowOf(first);
    await user.keyboard('{ArrowRight}');
    expect(rowOf(document.activeElement!)).toBe(row);
    expect(document.activeElement).not.toBe(first);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(first);
    await user.keyboard('{ArrowDown}');
    expect(rowOf(document.activeElement!)).not.toBe(row);
    const column = (document.activeElement!.closest('td') as HTMLTableCellElement).cellIndex;
    expect(column).toBe((first.closest('td') as HTMLTableCellElement).cellIndex);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);
  });

  it('stops at the ends instead of wrapping, and Home and End go to the row ends', async () => {
    mount();
    const user = userEvent.setup();
    const first = controls()[0]!;
    first.focus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(document.activeElement).toBe(first);
    await user.keyboard('{End}');
    const end = document.activeElement as HTMLElement;
    expect(rowOf(end)).toBe(rowOf(first));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(end);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(first);
  });

  it('the stop follows focus: the control last focused is the one Tab returns to', async () => {
    mount();
    const user = userEvent.setup();
    const target = controls()[9]!;
    target.focus();
    expect(target.tabIndex).toBe(0);
    expect(controls().filter((control) => control.tabIndex === 0)).toEqual([target]);
    await user.keyboard('{ArrowDown}');
    expect(target.tabIndex).toBe(-1);
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
  });

  it('leaves Enter and Space to the focused cell and takes no key with a modifier', async () => {
    mount();
    const user = userEvent.setup();
    const first = controls()[0]!;
    first.focus();
    await user.keyboard('{Control>}{ArrowRight}{/Control}{Alt>}{ArrowDown}{/Alt}');
    expect(document.activeElement).toBe(first);
  });
});

describe('a popover opened from a cell (#2883)', () => {
  // The readiness panel is portalled out of the table, but React focus events still bubble to the body that holds the chip.
  function WithPortal() {
    const body = useRef<HTMLTableSectionElement>(null);
    const roving = useRovingCells(body);
    return (
      <table>
        <tbody ref={body} onFocus={roving.onFocus} onKeyDown={roving.onKeyDown}>
          <tr data-chapter-id="a">
            <td>
              <button type="button">one</button>
            </td>
            <td>
              <button type="button">two</button>
              {createPortal(<button type="button">popover</button>, document.body)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  it('does not take the tab stop, and arrows in it do not move the cells', async () => {
    render(<WithPortal />);
    const user = userEvent.setup();
    const [one, two] = [screen.getByText('one'), screen.getByText('two')];
    expect([one.tabIndex, two.tabIndex]).toEqual([0, -1]);
    await user.click(screen.getByText('popover'));
    expect(document.activeElement).toBe(screen.getByText('popover'));
    expect([one.tabIndex, two.tabIndex]).toEqual([0, -1]);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByText('popover'));
    // Closing it (focus back on the cell last used) keeps one stop.
    two.focus();
    expect([one.tabIndex, two.tabIndex]).toEqual([-1, 0]);
  });
});

describe('a long book (#2883)', () => {
  const long = () => buildPipelineRows(Array.from({ length: 400 }, (_, i) => chapter(`c${i + 1}`)));
  const mountLong = () =>
    render(
      <TooltipProvider>
        <PipelineTable rows={long()} recommendations={new Map()} onGo={noop} notify={noop} onStatus={noop} />
      </TooltipProvider>,
    );

  it('keeps one tab stop among the drawn rows and none in a spacer', () => {
    mountLong();
    expect(controls().filter((control) => control.tabIndex === 0)).toHaveLength(1);
    expect(document.querySelectorAll('tbody tr[aria-hidden="true"] button')).toHaveLength(0);
  });

  it('Down from the last drawn row scrolls toward the next one and leaves focus where it is until that row is drawn', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    const scrolled = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    mountLong();
    const drawn = [...document.querySelectorAll<HTMLElement>('tbody tr[data-chapter-id]')];
    const cell = drawn[drawn.length - 1]!.querySelector<HTMLElement>('button')!;
    cell.focus();
    fireEvent.keyDown(cell, { key: 'ArrowDown' });
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(cell);
    scrolled.mockRestore();
    vi.unstubAllGlobals();
  });

  it('with Ctrl, End and Home go to the last and first drawn row', async () => {
    mountLong();
    const user = userEvent.setup();
    controls()[0]!.focus();
    await user.keyboard('{Control>}{End}{/Control}');
    const rows = [...document.querySelectorAll<HTMLElement>('tbody tr[data-chapter-id]')];
    expect(document.activeElement!.closest('tr')).toBe(rows[rows.length - 1]);
    await user.keyboard('{Control>}{Home}{/Control}');
    expect(document.activeElement!.closest('tr')).toBe(rows[0]);
  });
});
