import type { PageContext } from '../../input/pageCommands';
import type { SearchHit } from '../../registries/search';
import type { IconName } from '../../icons.catalog';

// What the jump menu lists, as data: one `Entry` per row from the three places a row comes from, and the pure functions that order
// and filter them. The component holds only the typed term, the group and the active row.

/** Where a row came from, which is also its rank: the page's own items, then the page's search hits, then the global commands. */
type Source = 'page' | 'hit' | 'command';

/** A group a row opens: a page group or a global command group. */
export type GroupRef = { source: 'page' | 'command'; name: string };

export type Entry = {
  id: string;
  /** The list heading. */
  group: string;
  title: string;
  /** Matched against the typed term and shown in the muted line. */
  hint?: string;
  /** Matched against the typed term, not drawn. */
  keywords?: readonly string[];
  sub?: string;
  keys?: string[];
  icon?: IconName;
  snippet?: SearchHit['snippet'];
  source: Source;
  /** The page or command group the row belongs to, for the group views. */
  groupName: string;
  /** A group row or the back row: choosing it changes the list and leaves the menu open. */
  opens?: GroupRef | 'back';
  /** Why the command cannot run now: it stays listed, off, with this reason. */
  disabledReason?: string;
  run: () => void;
};

export const PAGE_HEADING = 'On this page';
export const COMMANDS_HEADING = 'Commands';
/** The group of a page item that names none. */
const DEFAULT_PAGE_GROUP = 'Actions';

export const pageHeading = (group: string) => `${PAGE_HEADING} · ${group}`;

/** Every page item as a row. A loaded item with the id of one already there is dropped. */
export function pageEntries(page: PageContext | null, loaded: PageContext['items'] = []): Entry[] {
  if (!page) return [];
  const seen = new Set(page.items.map((row) => row.id));
  return [...page.items, ...loaded.filter((row) => !seen.has(row.id))].map((row) => ({
    id: `page-${row.id}`,
    group: pageHeading(row.group ?? DEFAULT_PAGE_GROUP),
    groupName: row.group ?? DEFAULT_PAGE_GROUP,
    title: row.label,
    hint: row.hint,
    keywords: row.keywords,
    icon: row.icon,
    source: 'page',
    disabledReason: row.disabledReason,
    run: row.run,
  }));
}

/** The rows a page contributes when nothing is typed: one per group, under the page heading. */
export function pageGroupRows(entries: readonly Entry[]): Entry[] {
  const names = [...new Set(entries.map((entry) => entry.groupName))];
  return names.map((name) => ({
    id: `page-group-${name}`,
    group: PAGE_HEADING,
    groupName: name,
    title: name,
    sub: `${entries.filter((entry) => entry.groupName === name).length} ›`,
    source: 'page',
    opens: { source: 'page', name },
    run: () => {},
  }));
}

const textOf = (entry: Entry) =>
  `${entry.title} ${entry.source === 'page' ? entry.groupName : ''} ${entry.hint ?? ''} ${entry.keywords?.join(' ') ?? ''}`.toLowerCase();

const matches = (entry: Entry, tokens: readonly string[]) => {
  const text = textOf(entry);
  return tokens.every((token) => text.includes(token));
};

/** A title that starts with the term before one that only holds it; the order inside each stays the source's. */
function startsFirst<T extends { title: string }>(rows: readonly T[], term: string): T[] {
  const lead = (row: T) => (row.title.toLowerCase().startsWith(term) ? 0 : 1);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => lead(a.row) - lead(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** Search hits as rows. */
export function hitEntries(hits: readonly SearchHit[]): Entry[] {
  return hits.map((hit, index) => ({
    id: `hit-${index}`,
    group: hit.group,
    groupName: hit.group,
    title: hit.title,
    sub: hit.sub,
    snippet: hit.snippet,
    source: 'hit',
    run: hit.run,
  }));
}

/**
 * The rows for a typed term, ranked: the page's matching items, then the page's search hits, then the global commands that match.
 * `commandsOnly` leaves the hits out; `pageOnly` leaves the commands out.
 */
export function rankEntries({
  page,
  hits,
  commands,
  term,
  pageOnly,
  commandsOnly,
}: {
  page: readonly Entry[];
  hits: readonly Entry[];
  commands: readonly Entry[];
  term: string;
  pageOnly: boolean;
  commandsOnly: boolean;
}): Entry[] {
  const tokens = term.split(/\s+/).filter(Boolean);
  const own = startsFirst(
    page.filter((entry) => matches(entry, tokens)),
    term,
  );
  const found = commandsOnly ? [] : hits;
  const global = pageOnly
    ? []
    : startsFirst(
        commands.filter((entry) => matches(entry, tokens)),
        term,
      );
  return [...own, ...found, ...global];
}
