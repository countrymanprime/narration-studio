import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import { useCommand } from '../../input/useCommand';
import { categoryLabel } from '../../state';
import type { GuideEntity, GuideType } from '../../types';
import { CHANGE_HIGHLIGHT_CLASSES } from '../primitives/changeHighlight';
import { Swatch } from '../primitives/Swatch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSpacer } from '../primitives/Table';
import { kindSwatch, typeUnknown } from './entryList';
import { COLUMNS, markedParts, matchedAlias, sortAria, type ColumnKey, type EntrySort } from './entryTable';
import { LooseSuggestionRows } from './suggested/panel/LooseSuggestionRows';

// The body rows are one height (`--row-height`, 39 px, and a cell never wraps), so the rows in view follow from the scroll position and a long book
// draws a screenful plus a margin instead of every entry.
const ROW_PX = 39;
/** A book of this many entries or fewer is drawn whole. */
const WINDOW_AFTER = 100;
const OVERSCAN = 10;
/** The height used for the scroll area until it has been measured (and where nothing is laid out, as in a unit test). */
const GUESS_HEIGHT = 600;

export type EntryTableProps = {
  /** The entries to draw, filtered and sorted. */
  rows: readonly GuideEntity[];
  /** Suggestions with no entry yet, drawn above the entries. */
  loose?: readonly ExtractionSuggestion[];
  types: readonly GuideType[];
  sort: EntrySort;
  onSort: (column: ColumnKey) => void;
  /** The entry open in the detail pane. */
  openId?: string;
  /** The loose suggestion open in the detail pane. */
  looseId?: string | null;
  /** The entry an action just changed, lit once. */
  changedId?: string | null;
  onOpen: (id: string) => void;
  onOpenLoose: (id: string) => void;
  /** What the table says when it has no row to draw. */
  empty: ReactNode;
  /** The search words in force (folded): a row marks the letters they matched and names the alias that put it in the list. */
  words?: readonly string[];
  /** Lets the search box move focus into the table (Down in the box). */
  handle?: Ref<EntryTableHandle>;
};

export type EntryTableHandle = { focusFirst: () => void };

const COL_WIDTH: Partial<Record<ColumnKey, string>> = { kind: 'w-[8rem]' };

/**
 * The Story Bible's entries as a data table: a header that sorts, one row per entry, one tab stop moved by the arrow keys, and only the rows in view
 * drawn once the book is long. It reports what the narrator did (a sort, an entry opened) and owns nothing else.
 */
export function EntryTable({
  rows,
  loose = [],
  types,
  sort,
  onSort,
  openId,
  looseId = null,
  changedId = null,
  onOpen,
  onOpenLoose,
  empty,
  words = [],
  handle,
}: EntryTableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string>();
  // The row to focus once it has been drawn: a jump to an end of a windowed list lands on a row that was not in the DOM.
  const [pendingId, setPendingId] = useState<string>();
  const [view, setView] = useState({ top: 0, height: GUESS_HEIGHT });
  const windowed = rows.length > WINDOW_AFTER;

  const measure = useCallback(() => {
    const element = scroller.current;
    if (element) setView({ top: element.scrollTop, height: element.clientHeight || GUESS_HEIGHT });
  }, []);
  useLayoutEffect(() => {
    measure();
    const element = scroller.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const focusedIndex = focusedId ? rows.findIndex((row) => row.id === focusedId) : -1;
  let start = 0;
  let end = rows.length;
  if (windowed) {
    start = Math.max(0, Math.floor(view.top / ROW_PX) - OVERSCAN);
    end = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_PX) + OVERSCAN);
    // The row focus is on stays drawn, so scrolling away with the wheel never drops the keyboard to the page.
    if (focusedIndex >= 0) {
      start = Math.min(start, focusedIndex);
      end = Math.max(end, focusedIndex + 1);
    }
  }
  const drawn = rows.slice(start, end);

  const rowElement = useCallback(
    (id: string) => [...(scroller.current?.querySelectorAll<HTMLElement>('[data-entry-id]') ?? [])].find((element) => element.dataset.entryId === id) ?? null,
    [],
  );
  const focusEntry = useCallback(
    (id: string) => {
      const element = rowElement(id);
      if (element) return element.focus();
      const index = rows.findIndex((row) => row.id === id);
      const area = scroller.current;
      if (index < 0 || !area) return;
      const top = Math.max(0, index * ROW_PX - area.clientHeight / 2);
      area.scrollTop = top;
      setView({ top, height: area.clientHeight || GUESS_HEIGHT });
      setPendingId(id);
    },
    [rows, rowElement],
  );
  useEffect(() => {
    if (!pendingId) return;
    const element = rowElement(pendingId);
    if (!element) return;
    element.focus();
    setPendingId(undefined);
  }, [pendingId, start, end, rowElement]);

  // The first row: a loose suggestion when there are some (they are drawn first), else the first entry.
  useImperativeHandle(
    handle,
    () => ({
      focusFirst: () => {
        const first = scroller.current?.querySelector<HTMLElement>('tbody [data-loose]');
        if (first) return first.focus();
        if (rows[0]) focusEntry(rows[0].id);
      },
    }),
    [rows, focusEntry],
  );

  // Up and Down step from the entry open when focus is elsewhere (the catalogue's page-scope rows, rebindable and on the key sheet). With a row
  // of the table focused the table's own keys step, so the command leaves the key to them instead of stepping twice.
  const step = (delta: -1 | 1) => {
    if (scroller.current?.contains(document.activeElement)) return;
    const from = rows.findIndex((row) => row.id === openId);
    const next = rows[from < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, from + delta))];
    if (next) focusEntry(next.id);
  };
  useCommand('storybible.entry.next', () => step(1));
  useCommand('storybible.entry.prev', () => step(-1));

  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ((event.target as HTMLElement).tagName !== 'TR') return;
    if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const edge = event.key === 'Home' ? rows[0] : rows[rows.length - 1];
    if (edge) focusEntry(edge.id);
  };

  const onFocus = (event: FocusEvent<HTMLTableSectionElement>) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-entry-id]')?.dataset.entryId;
    if (id) setFocusedId(id);
  };

  // The one tab stop: the loose suggestion open, else the entry focus last rested on, else the one open, else the first row (a loose one when there is no entry).
  const looseStop = loose.find((suggestion) => suggestion.id === looseId)?.id ?? null;
  const stopId = looseStop ? undefined : (rows.find((row) => row.id === focusedId)?.id ?? rows.find((row) => row.id === openId)?.id ?? rows[0]?.id);
  const firstLooseStop = looseStop ?? (stopId ? null : (loose[0]?.id ?? null));
  const columns = COLUMNS.length;
  const nothing = rows.length === 0 && loose.length === 0;

  return (
    <div ref={scroller} data-entry-scroll="" onScroll={windowed ? measure : undefined} className="@container min-h-0 flex-1 overflow-auto">
      <Table label="Story Bible entries" rowCount={windowed ? rows.length + loose.length + 1 : undefined} className="table-fixed">
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.key} className={COL_WIDTH[column.key] ?? ''} />
          ))}
        </colgroup>
        <TableHead sticky>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHeader key={column.key} align={column.numeric ? 'right' : 'left'} sorted={sortAria(sort, column.key)} onSort={() => onSort(column.key)}>
                {column.label}
              </TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody navigable onKeyDown={onKeyDown} onFocus={onFocus}>
          <LooseSuggestionRows suggestions={loose} selectedId={looseId} tabStopId={firstLooseStop} onSelect={onOpenLoose} />
          {start > 0 && <TableSpacer height={start * ROW_PX} columns={columns} />}
          {drawn.map((row, offset) => (
            <EntryRow
              key={row.id}
              entry={row}
              types={types}
              index={loose.length + start + offset + 2}
              open={openId === row.id}
              changed={changedId === row.id}
              tabStop={row.id === stopId}
              words={words}
              onOpen={() => onOpen(row.id)}
            />
          ))}
          {end < rows.length && <TableSpacer height={(rows.length - end) * ROW_PX} columns={columns} />}
          {nothing && (
            <TableRow>
              <TableCell colSpan={columns} className="py-3 whitespace-normal text-[var(--text-muted)]">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EntryRow({
  entry,
  types,
  index,
  open,
  changed,
  tabStop,
  words,
  onOpen,
}: {
  entry: GuideEntity;
  types: readonly GuideType[];
  index: number;
  open: boolean;
  changed: boolean;
  tabStop: boolean;
  words: readonly string[];
  onOpen: () => void;
}) {
  const alias = matchedAlias(entry, words);
  const kind = entry.category === 'Draft' ? categoryLabel(entry.category) : typeUnknown(entry) ? 'Type not set' : entry.category;
  return (
    <TableRow
      data={{ 'data-entry-id': entry.id, ...(changed ? { 'data-just-changed': '' } : {}) }}
      rowIndex={index}
      selected={open}
      tabStop={tabStop}
      onActivate={onOpen}
      className={changed ? CHANGE_HIGHLIGHT_CLASSES : ''}
    >
      <TableCell className="overflow-hidden">
        <span className="block truncate">
          <span dir="auto" data-entry-name="" className="font-semibold">
            <Marked text={entry.canonical_name} words={words} />
          </span>
          {alias !== undefined && (
            <span data-entry-alias="" className="ml-1.5 text-[0.82rem] text-[var(--text-muted)]">
              also “
              <span dir="auto">
                <Marked text={alias} words={words} />
              </span>
              ”
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <Swatch colour={kindSwatch(types, entry.category)} />
          <span className="truncate">{kind}</span>
        </span>
      </TableCell>
    </TableRow>
  );
}

/** The text with the letters a search matched in a `<mark>`. */
function Marked({ text, words }: { text: string; words: readonly string[] }) {
  if (words.length === 0) return text;
  return markedParts(text, words).map((part, index) =>
    part.marked ? (
      <mark key={index} className="rounded-sm bg-[var(--warn-soft)] px-px text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}
