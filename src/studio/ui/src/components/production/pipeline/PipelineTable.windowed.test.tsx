// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { chapter } from './pipelineFixtures';
import { PipelineTable } from './PipelineTable';
import { buildPipelineRows, nameTip, NAME_TIP_LIMIT } from './pipelineRows';
import { OVERSCAN, ROW_PX, rowWindow, WINDOW_AFTER } from './rowWindow';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => undefined;
const book = (count: number) => buildPipelineRows(Array.from({ length: count }, (_, i) => chapter(`c${i + 1}`)));

function mount(count: number) {
  return render(
    <TooltipProvider>
      <PipelineTable rows={book(count)} recommendations={new Map()} onGo={noop} notify={noop} onStatus={noop} />
    </TooltipProvider>,
  );
}
const bodyRows = () => document.querySelectorAll('tbody tr[data-chapter-id]');

describe('rowWindow', () => {
  it('draws the rows in view and a margin, and never fewer than one', () => {
    expect(rowWindow(5000, 0, 800)).toEqual([{ start: 0, end: Math.ceil(800 / ROW_PX) + OVERSCAN }]);
    const [mid] = rowWindow(5000, 10 * ROW_PX * 100, 800);
    expect(mid!.start).toBe(1000 - OVERSCAN);
    expect(mid!.end - mid!.start).toBeLessThan(40);
    // Scrolled past the end (a shrunk list) or given nothing to draw.
    expect(rowWindow(10, 999999, 800)).toEqual([{ start: 9, end: 10 }]);
    expect(rowWindow(0, 0, 800)).toEqual([]);
  });

  it('keeps a focused row drawn wherever the view is, alone rather than with every row between', () => {
    const ranges = rowWindow(5000, 3000 * ROW_PX, 800, 5);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 5, end: 6 });
    expect(ranges[1]!.start).toBeGreaterThan(2900);
    // Next to the view, the two join.
    expect(rowWindow(5000, 100 * ROW_PX, 800, 100 - OVERSCAN - 1)).toHaveLength(1);
  });
});

describe('PipelineTable with a long book (#1764)', () => {
  it('mounts a bounded number of rows, tooltips and nodes for 5000 chapters', () => {
    mount(5000);
    expect(bodyRows().length).toBeGreaterThan(0);
    expect(bodyRows().length).toBeLessThan(60);
    // Seven stage cells and the Rec. cell per row, each a tooltip target: hundreds, not 35,000.
    expect(document.querySelectorAll('tbody [data-cell], tbody [role="img"]').length).toBeLessThan(60 * 9);
    expect(document.querySelectorAll('*').length).toBeLessThan(5000);
  });

  it('says how many rows the table has and where each drawn row stands, header row first', () => {
    mount(5000);
    expect(screen.getByRole('table', { name: 'Chapter pipeline' }).getAttribute('aria-rowcount')).toBe('5001');
    expect(bodyRows()[0]!.getAttribute('aria-rowindex')).toBe('2');
    expect(bodyRows()[1]!.getAttribute('aria-rowindex')).toBe('3');
    // The spacer that holds the place of the rows below is hidden from a screen reader and as tall as they would be.
    const spacer = document.querySelector<HTMLElement>('tbody tr[aria-hidden="true"]')!;
    expect(spacer.style.height).toBe(`${(5000 - bodyRows().length) * ROW_PX}px`);
  });

  it('holds each drawn row to one height: the name clamps to two lines, and only a windowed list does it', () => {
    mount(WINDOW_AFTER + 50);
    expect(document.querySelectorAll('tbody tr[data-chapter-id] .line-clamp-2').length).toBe(bodyRows().length);
    expect((bodyRows()[0] as HTMLElement).style.height).toBe(`${ROW_PX}px`);
    cleanup();
    mount(WINDOW_AFTER);
    expect(document.querySelector('tbody .line-clamp-2')).toBeNull();
    expect((bodyRows()[0] as HTMLElement).style.height).toBe('');
  }, 40_000);

  it('keeps the whole name in the DOM and in the accessible names of the row, however it is clamped', () => {
    const rows = buildPipelineRows([chapter('c1', { title: 'A very long chapter title that will wrap past two lines of the name column and be clamped' })]);
    const long = Array.from({ length: WINDOW_AFTER + 10 }, () => rows[0]!).map((row, i) => ({ ...row, id: `c${i + 1}` }));
    render(
      <TooltipProvider>
        <PipelineTable rows={long} recommendations={new Map()} onGo={noop} notify={noop} onStatus={noop} />
      </TooltipProvider>,
    );
    const first = bodyRows()[0] as HTMLElement;
    expect(first.querySelector('.line-clamp-2')!.textContent).toContain('be clamped');
    expect(first.querySelector('[data-cell]')!.getAttribute('aria-label')).toContain('be clamped');
  });

  it('a name with no break opportunity stays inside its cell: the tip target holds to its column and the clamp breaks anywhere', () => {
    const rows = buildPipelineRows([chapter('c1', { title: 'U'.repeat(10_000) })]);
    const long = Array.from({ length: WINDOW_AFTER + 10 }, (_, i) => ({ ...rows[0]!, id: `c${i + 1}` }));
    render(
      <TooltipProvider>
        <PipelineTable rows={long} recommendations={new Map()} onGo={noop} notify={noop} onStatus={noop} />
      </TooltipProvider>,
    );
    const clamp = bodyRows()[0]!.querySelector('.line-clamp-2') as HTMLElement;
    // The tip target is a box as wide as the cell (not one that takes the width of its text) and may shrink; the clamp breaks anywhere.
    const trigger = clamp.parentElement as HTMLElement;
    expect(trigger.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(trigger.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(clamp.className).toContain('[overflow-wrap:anywhere]');
  });

  it('caps the tip text of a very long name so the tip fits a window, and leaves a normal name whole', () => {
    expect(nameTip('Chapter 1 — Down the Rabbit-Hole')).toBe('Chapter 1 — Down the Rabbit-Hole');
    const tip = nameTip('word '.repeat(2_000));
    expect(tip.length).toBeLessThanOrEqual(NAME_TIP_LIMIT);
    expect(tip.endsWith('…')).toBe(true);
  });

  it('draws a book of the threshold size whole, with no spacers and no row count', () => {
    mount(WINDOW_AFTER);
    expect(bodyRows()).toHaveLength(WINDOW_AFTER);
    expect(document.querySelector('tbody tr[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('table', { name: 'Chapter pipeline' }).hasAttribute('aria-rowcount')).toBe(false);
  });

  it('draws the rows further down once the page scrolls', async () => {
    mount(5000);
    expect(bodyRows()[0]!.getAttribute('data-chapter-id')).toBe('c1');
    // jsdom lays nothing out: the body sits `scrolled` px above the top of the view.
    let scrolled = 2000 * ROW_PX;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.tagName === 'TBODY' ? -scrolled : 0 } as DOMRect;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    const ids = Array.from(bodyRows()).map((row) => row.getAttribute('data-chapter-id'));
    expect(ids).toContain('c2001');
    expect(ids).not.toContain('c1');
    expect(bodyRows().length).toBeLessThan(60);
    scrolled = 0;
    vi.unstubAllGlobals();
  });

  it('keeps the row with focus drawn when the page scrolls away from it', async () => {
    mount(5000);
    const first = document.querySelector<HTMLElement>('tbody tr[data-chapter-id="c3"] button')!;
    await act(async () => first.focus());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.tagName === 'TBODY' ? -3000 * ROW_PX : 0 } as DOMRect;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(document.querySelector('tbody tr[data-chapter-id="c3"]')).not.toBeNull();
    expect(document.querySelector('tbody tr[data-chapter-id="c3001"]')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
