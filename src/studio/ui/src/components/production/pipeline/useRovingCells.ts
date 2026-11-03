import { useCallback, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { revealRow } from './rowWindow';

// One tab stop for the pipeline's cells (#2883). Every row has up to eight buttons (a stage cell each and a readiness chip), so Tab crossed a
// hundred of them before the page's next section. The table is a grid to the keyboard instead: Tab enters it once, on the control last
// used, and the arrows move between cells (Left and Right along a row, Up and Down in the same column, Home and End to a row's ends).
// The tab stop is set on the elements themselves after every render, so rows a windowed list draws later join it without a prop on each cell.

const CONTROLS = 'button:not(:disabled), a[href]';
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

const controlsOf = (row: Element): HTMLElement[] => [...row.querySelectorAll<HTMLElement>(CONTROLS)];
const columnOf = (control: HTMLElement): number => (control.closest('td') as HTMLTableCellElement | null)?.cellIndex ?? 0;
/** The control of `row` in `column`, else the nearest column that has one. */
function inColumn(row: Element, column: number): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  for (const control of controlsOf(row)) {
    if (!best || Math.abs(columnOf(control) - column) < Math.abs(columnOf(best) - column)) best = control;
  }
  return best;
}
/** The drawn row next to `row`, skipping the spacers that hold the place of rows not drawn. */
const neighbour = (row: HTMLElement, step: 1 | -1): HTMLElement | undefined => {
  const next = (step === 1 ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
  return next?.dataset.chapterId ? next : undefined;
};

function focusAt(row: HTMLElement, column: number, retries = 3): void {
  const target = inColumn(row, column);
  if (target) target.focus();
  else if (retries > 0) requestAnimationFrame(() => focusAt(row, column, retries - 1));
}

export function useRovingCells(body: RefObject<HTMLTableSectionElement | null>) {
  const active = useRef<HTMLElement | null>(null);

  const apply = useCallback(() => {
    const root = body.current;
    if (!root) return;
    const all = controlsOf(root);
    if (!active.current || !root.contains(active.current) || !all.includes(active.current)) active.current = all[0] ?? null;
    for (const control of all) {
      const want = control === active.current ? 0 : -1;
      if (control.tabIndex !== want) control.tabIndex = want;
    }
  }, [body]);
  // After every render: a row drawn since the last one starts out of the Tab order.
  useLayoutEffect(apply);

  const onFocus = useCallback(
    (event: FocusEvent<HTMLTableSectionElement>) => {
      const control = (event.target as HTMLElement).closest<HTMLElement>(CONTROLS);
      if (control && control !== active.current) {
        active.current = control;
        apply();
      }
    },
    [apply],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableSectionElement>) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey || !ARROWS.includes(event.key)) return;
      if (event.ctrlKey && event.key !== 'Home' && event.key !== 'End') return;
      const control = (event.target as HTMLElement).closest<HTMLElement>(CONTROLS);
      const row = control?.closest<HTMLElement>('tr[data-chapter-id]');
      const root = body.current;
      if (!control || !row || !root) return;
      const along = controlsOf(row);
      const at = along.indexOf(control);
      let to: HTMLElement | undefined;
      if (event.key === 'ArrowLeft') to = along[Math.max(0, at - 1)];
      else if (event.key === 'ArrowRight') to = along[Math.min(along.length - 1, at + 1)];
      else if (event.key === 'Home' || event.key === 'End') {
        const rows = [...root.querySelectorAll<HTMLElement>('tr[data-chapter-id]')];
        const edge = event.ctrlKey ? (event.key === 'Home' ? rows[0] : rows[rows.length - 1]) : row;
        const list = edge ? controlsOf(edge) : [];
        to = event.key === 'Home' ? list[0] : list[list.length - 1];
      } else {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = neighbour(row, step);
        const column = columnOf(control);
        event.preventDefault();
        if (next) return void inColumn(next, column)?.focus();
        // The next row is not drawn yet (a windowed list): scroll to it and focus it once it is.
        const place = Number(row.getAttribute('aria-rowindex')) - 2 + step;
        const sibling = step === 1 ? row.nextElementSibling : row.previousElementSibling;
        if (sibling && Number.isFinite(place) && place >= 0 && sibling.getAttribute('aria-hidden') === 'true') {
          revealRow(root, place);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const drawn = [...root.querySelectorAll<HTMLElement>('tr[data-chapter-id]')].find((tr) => Number(tr.getAttribute('aria-rowindex')) - 2 === place);
              if (drawn) focusAt(drawn, column);
            }),
          );
        }
        return;
      }
      event.preventDefault();
      to?.focus();
    },
    [body],
  );

  return { onFocus, onKeyDown };
}
