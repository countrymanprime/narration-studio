import { useEffect, useRef } from 'react';
import type { IconName } from '../icons.catalog';

/**
 * One thing the page in front of the narrator offers the jump menu, under "On this page" (docs/architecture/studio-shell-and-registries.md#page-commands).
 * It depends on the page's state, not only the route: a chapter the page loaded, a setting row, a cut that needs a selection.
 */
export type PageItem = {
  /** Unique within the page; the menu keys its row on it. */
  id: string;
  label: string;
  /** The heading it sits under inside "On this page" ("Chapters", "Checks"); ungrouped items sit under "Actions". */
  group?: string;
  /** Matched against the typed term but not drawn: aliases, a setting's description. */
  keywords?: readonly string[];
  /** The muted line under the label. */
  hint?: string;
  /** A leading icon, by action name from the icon catalogue. */
  icon?: IconName;
  /** Why the item cannot run now. It stays listed, off, with this reason. */
  disabledReason?: string;
  run: () => void;
};

/** Who is offering: `label` is the page's name, which the menu says when it opens. */
export type PageRef = {
  id: string;
  label: string;
  /** Global jump-menu groups ("Chapters") this page replaces with its own, so a chapter is not listed twice. */
  supersedes?: readonly string[];
};

/** The current items. Read each time the menu opens, never at registration. */
export type PageItems = () => readonly PageItem[];
/** Items that need the host. The menu draws the rest first and adds these when they arrive; a rejection leaves them out. */
export type PageLoad = () => Promise<readonly PageItem[]>;

type Registration = { page: PageRef; items: PageItems; load?: PageLoad };

const registrations = new Set<Registration>();

/** What the menu reads: the page's name, its items now, and the loader for the rest. */
export type PageContext = PageRef & { items: readonly PageItem[]; load?: () => Promise<readonly PageItem[]> };

/** Registers a page's items and returns the function that removes them. Two registrations of one page merge. */
export function registerPageCommands(page: PageRef, items: PageItems, load?: PageLoad): () => void {
  // An object per call keeps two registrations of one function distinct, so each unregister removes only its own.
  const entry: Registration = { page, items, load };
  registrations.add(entry);
  return () => void registrations.delete(entry);
}

/**
 * The page's context, or null when no page has registered. Throws for two items with one id, since the menu keys its rows on it.
 * With several registrations the first one names the page; the items come in registration order.
 */
export function currentPageContext(): PageContext | null {
  const all = [...registrations];
  const first = all[0];
  if (!first) return null;
  const items = all.flatMap((entry) => entry.items());
  const seen = new Set<string>();
  for (const row of items) {
    if (seen.has(row.id)) throw new Error(`Page item "${row.id}" on "${first.page.id}" is a duplicate id.`);
    seen.add(row.id);
  }
  const loaders = all.flatMap((entry) => (entry.load ? [entry.load] : []));
  const supersedes = [...new Set(all.flatMap((entry) => entry.page.supersedes ?? []))];
  return {
    id: first.page.id,
    label: first.page.label,
    supersedes: supersedes.length > 0 ? supersedes : undefined,
    items,
    load: loaders.length > 0 ? async () => (await Promise.all(loaders.map((load) => load()))).flat() : undefined,
  };
}

/**
 * Offers `items` to the jump menu while the caller is mounted. `items` may be a plain array built each render or a function; the menu reads the
 * latest each time it opens, so a new array never registers again. `load` fetches the items that need the host after the menu is open.
 */
export function usePageCommands(page: PageRef, items: readonly PageItem[] | PageItems, load?: PageLoad): void {
  const latest = useRef({ items, load });
  latest.current = { items, load };
  const { id, label } = page;
  const supersedes = page.supersedes?.join('\u0000');
  const lazy = load !== undefined;
  useEffect(
    () =>
      registerPageCommands(
        { id, label, supersedes: supersedes ? supersedes.split('\u0000') : undefined },
        () => {
          const { items: source } = latest.current;
          return typeof source === 'function' ? source() : source;
        },
        lazy ? () => latest.current.load!() : undefined,
      ),
    [id, label, supersedes, lazy],
  );
}
