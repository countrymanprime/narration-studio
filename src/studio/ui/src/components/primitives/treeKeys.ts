import type { KeyboardEvent } from 'react';

// The keys of a WAI-ARIA tree, shared by the tree table (rows of `TableRow tree`) and the track picker (`role="treeitem"` rows): each row
// carries `data-tree-row` (its id), `data-level` and, on a folder, `aria-expanded`. Only the rows drawn are in the DOM, so a closed
// folder's children are never walked into. Up and Down move, Home and End jump, Right opens a closed folder or enters an open one,
// Left closes an open folder or goes to its parent, Enter and Space toggle a folder. A key aimed at a control inside a row is that control's.

const ROW = '[data-tree-row]';

/** The handler for the element that holds the rows (a `tbody`, a `ul`). `onToggle` is told the folder and whether it should be open. */
export function treeKeyHandler(onToggle: (id: string, open: boolean) => void, onEnter?: (id: string) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const row = event.target as HTMLElement;
    if (!row.matches(ROW)) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(ROW)];
    const at = rows.indexOf(row);
    const id = row.dataset.treeRow ?? '';
    const expanded = row.getAttribute('aria-expanded');
    const level = Number(row.dataset.level);
    const go = (target: HTMLElement | undefined) => {
      event.preventDefault();
      target?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return go(rows[Math.min(rows.length - 1, at + 1)]);
      case 'ArrowUp':
        return go(rows[Math.max(0, at - 1)]);
      case 'Home':
        return go(rows[0]);
      case 'End':
        return go(rows[rows.length - 1]);
      case 'ArrowRight':
        if (expanded === 'false') {
          event.preventDefault();
          onToggle(id, true);
        } else if (expanded === 'true') go(rows[at + 1]?.dataset.level && Number(rows[at + 1].dataset.level) > level ? rows[at + 1] : undefined);
        return;
      case 'ArrowLeft':
        if (expanded === 'true') {
          event.preventDefault();
          onToggle(id, false);
        } else go([...rows.slice(0, at)].reverse().find((candidate) => Number(candidate.dataset.level) < level));
        return;
      case 'Enter':
      case ' ':
        if (onEnter) {
          event.preventDefault();
          onEnter(id);
        } else if (expanded !== null) {
          event.preventDefault();
          onToggle(id, expanded === 'false');
        }
        return;
    }
  };
}
