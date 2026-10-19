import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { openingId, type FileRow } from './rows';

/**
 * Which file of the table is selected, and how the keyboard moves it (the mock's Master page: the table opens on the first file
 * that fails, the arrow keys move between files, Enter selects). The caller owns the selection (it is the shared chapter);
 * until it has one this reports the opening file and asks for it once, so the chapter bar says so too. A selection that names
 * no row (a chapter with no file) is kept: nothing is selected then.
 *
 * `Table` has no roving tabindex or grid role of its own, so `bind` puts both on the table it holds: one row in the tab order,
 * the selected one, and `role="grid"`.
 */
export function useMasterSelection({ rows, selected, onSelect }: { rows: readonly FileRow[]; selected: string | undefined; onSelect: (id: string) => void }) {
  const opening = openingId(rows);
  const current = selected ?? opening;
  const container = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selected === undefined && opening !== undefined) onSelect(opening);
  }, [selected, opening, onSelect]);

  useEffect(() => {
    const table = container.current?.querySelector('table');
    table?.setAttribute('role', 'grid');
    const all = [...(container.current?.querySelectorAll<HTMLElement>('tr[data-row]') ?? [])];
    const stop = all.find((tr) => tr.getAttribute('aria-selected') === 'true') ?? all[0];
    for (const tr of all) tr.tabIndex = tr === stop ? 0 : -1;
  });

  const bind = useCallback((node: HTMLElement | null) => {
    container.current = node;
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const index = rows.findIndex((row) => row.id === current);
    const last = rows.length - 1;
    const next =
      event.key === 'ArrowDown'
        ? Math.min(last, index + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined || last < 0) return;
    event.preventDefault();
    const id = rows[next]!.id;
    onSelect(id);
    const target = [...(container.current?.querySelectorAll<HTMLElement>('tr[data-row]') ?? [])][next];
    target?.focus();
  };

  return { current, bind, onKeyDown };
}
