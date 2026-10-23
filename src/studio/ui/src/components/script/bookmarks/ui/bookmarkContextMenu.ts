import { useMemo } from 'react';
import { useContextProvider, type ContextProvider } from '../../../../registries/context';

/** The attribute a ribbon carries: its bookmark's id. */
const RIBBON = '[data-bm]';

/**
 * The right-click menu of a bookmark ribbon: Edit bookmark (opens the ribbon's editor by pressing the ribbon) and Delete bookmark.
 * It matches a ribbon and nothing else.
 */
function bookmarkContextProvider(onRemove: (id: string) => unknown): ContextProvider {
  const ribbon = (target: Element): HTMLElement | null => target.closest<HTMLElement>(RIBBON);
  return {
    match: (target) => ribbon(target)?.dataset.bm !== undefined,
    items: (target) => {
      const el = ribbon(target);
      const id = el?.dataset.bm ?? '';
      return [
        { key: 'bookmark-edit', label: 'Edit bookmark', onSelect: () => el?.click() },
        { key: 'bookmark-delete', label: 'Delete bookmark', onSelect: () => void onRemove(id) },
      ];
    },
  };
}

/** Registers the ribbon menu while the page that draws ribbons is mounted. */
export function useBookmarkContextMenu(onRemove: (id: string) => unknown): void {
  useContextProvider(useMemo(() => bookmarkContextProvider(onRemove), [onRemove]));
}
