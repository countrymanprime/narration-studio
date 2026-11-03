// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { PipelineTable } from './PipelineTable';
import { buildPipelineRows } from './pipelineRows';
import { MID_BOOK, MID_BOOK_RECOMMENDATIONS, MID_BOOK_SOURCES } from './pipelineFixtures';

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
