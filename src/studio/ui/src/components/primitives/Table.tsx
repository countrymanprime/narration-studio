import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { TABLE_CELL_CLASS, TABLE_EDGES, TABLE_FLUSH_EDGES, TABLE_HEADER_CLASS, TABLE_TEXT_CLASS, TABLE_TEXT_EDGES } from './tableStyles';
import { Tooltip } from './Tooltip';

// A presentational data table. It replaces the `table.dtable` rules in components.css: the look lives here, in
// tokens, and the parts stay the browser's own table elements (`table`, `thead`, `tbody`, `tr`, `th`, `td`), so the table
// semantics, the column layout and the cell spanning are the platform's. It sorts, filters and selects nothing itself: the
// caller owns the rows and reports what the user did. TanStack Table stays the option if that ever grows. Its sizes and
// type are the mocks' (tableStyles.ts).

// `label` names the table for a screen reader ("Chapters", "Aliases"). `flush` runs it to the side edges of the Panel it
// sits in, as the mocks draw a table in a card; the cells' own padding keeps the text off the card's border. It spans the
// Panel body's padding (`--panel-pad`), which is nothing in a `Panel flush`.
// `rowCount` is the number of rows when the caller draws only some of them (a windowed list); each drawn row then says its place with
// `TableRow rowIndex`, counted from 1 with the header row as row 1.
// `tree` makes it a `treegrid`: each `TableRow tree` row says its level, place and, on a folder, whether it is open.
// `columns` fixes the column widths, one CSS width per column in order (`'12rem'`, `'30%'`, `'auto'` for a column that takes what
// is left): the table lays out from them (`table-fixed`), not from its content, so columns stay put between states and a long
// cell wraps inside its own column instead of pushing the others.
// A table that runs to its card's edges (`flush`, or any table in a `Panel flush`) starts its first column and ends its last
// 16 px in, where the card title starts, and drops the last row's rule, which the card's own border replaces
// (alignment audit cause D).
// `textEdges` is for a table that reads as part of a padded card's form rather than a block of its own (a Story Bible entry's properties):
// its first column starts and its last ends at the card's text edge, level with the labels and fields above it, instead of 10 px in
// (alignment audit SBX-13). It has no effect with `flush`, which is at the card's edges already.
export function Table({
  label,
  flush = false,
  textEdges = false,
  rowCount,
  columns,
  tree = false,
  className = '',
  children,
}: {
  label: string;
  flush?: boolean;
  textEdges?: boolean;
  /** The rows are a tree (`TableRow tree`): the table is a `treegrid` and its body takes the tree keys (`treeKeyHandler`). */
  tree?: boolean;
  rowCount?: number;
  columns?: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <table
      role={tree ? 'treegrid' : undefined}
      aria-label={label}
      aria-rowcount={rowCount}
      className={`border-collapse ${TABLE_TEXT_CLASS} ${flush ? `-mx-[var(--panel-pad,1rem)] w-[calc(100%+2*var(--panel-pad,1rem))] ${TABLE_FLUSH_EDGES}` : `w-full ${textEdges ? TABLE_TEXT_EDGES : TABLE_EDGES}`} ${columns ? 'table-fixed' : ''} ${className}`}
    >
      {columns && (
        <colgroup>
          {columns.map((width, index) => (
            <col key={index} style={width === 'auto' ? undefined : { width }} />
          ))}
        </colgroup>
      )}
      {children}
    </table>
  );
}

// `sticky` keeps the header row on top of a scrolling list, on an opaque background.
export function TableHead({ sticky = false, children }: { sticky?: boolean; children: ReactNode }) {
  return <thead className={sticky ? 'sticky top-0 z-[2] bg-[var(--surface)]' : undefined}>{children}</thead>;
}

// `navigable` moves focus between the pressable rows with Up and Down (Home and End go to the first and last row that is drawn), for
// a table whose rows share one tab stop (`TableRow tabStop`). A key aimed at a control inside a row is that control's. `onKeyDown` also
// hears every key, for a caller that draws only some of its rows and so has to find the ends itself.
export function TableBody({
  navigable = false,
  onKeyDown,
  onFocus,
  children,
}: {
  navigable?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLTableSectionElement>) => void;
  /** Hears the focus of any row or control in the body (focus bubbles), to follow which row it rests on. */
  onFocus?: (event: FocusEvent<HTMLTableSectionElement>) => void;
  children: ReactNode;
}) {
  const onKey = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    onKeyDown?.(event);
    if (!navigable || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const row = event.target as HTMLElement;
    if (row.tagName !== 'TR' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('tr[data-row]')];
    const from = rows.indexOf(row);
    const to =
      event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, from + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    rows[to]?.focus();
  };
  return (
    <tbody onKeyDown={navigable || onKeyDown ? onKey : undefined} onFocus={onFocus}>
      {children}
    </tbody>
  );
}

// How a row stands out without being selected: `current` is the row the work is on (bold, no fill: mock 01's current
// chapter), `highlight` is a row the page points at (the selected fill, not announced: mock 05's failing file).
const ROW_EMPHASIS = { current: 'font-semibold', highlight: 'bg-[var(--row-selected)]' } as const;

// A row. With `onActivate` it is a control: it takes a tab stop, Enter or Space on the row activates it (a press on a button
// or link inside it does not, by key or by pointer: that control acts on its own), the pointer shows it is pressable, and `selected` marks the
// current one (`aria-selected`) and fills it with `--row-selected`; `tabStop={false}` takes it out of the tab order (the rows of a
// `navigable` body share one stop and the arrow keys reach the rest). Without `onActivate` it is a plain row. `data-row` marks a pressable row for the
// visual suite's drivers.
export function TableRow({
  onActivate,
  tabStop = true,
  rowIndex,
  selected = false,
  emphasis,
  tree,
  className = '',
  style,
  data,
  children,
}: {
  onActivate?: () => void;
  /**
   * A row of a tree table: `id` keys it for the tree keys, `level` is `aria-level` (1 at the top), `posInSet` and `setSize` its place among its siblings,
   * `expanded` is set on a folder only, and `active` is the one row in the tab order (the others are reached with the arrow keys).
   */
  tree?: { id: string; level: number; posInSet: number; setSize: number; expanded?: boolean; active: boolean };
  tabStop?: boolean;
  rowIndex?: number;
  /** `data-*` attributes for the row, such as the key a right-click menu reads (`data-w` on the Script page's Words rows). */
  data?: Record<`data-${string}`, string>;
  selected?: boolean;
  emphasis?: keyof typeof ROW_EMPHASIS;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const emphasisClass = emphasis ? ROW_EMPHASIS[emphasis] : '';
  if (tree) {
    return (
      <tr
        {...data}
        data-tree-row={tree.id}
        data-level={tree.level}
        aria-level={tree.level}
        aria-posinset={tree.posInSet}
        aria-setsize={tree.setSize}
        aria-expanded={tree.expanded}
        tabIndex={tree.active ? 0 : -1}
        className={`hover:*:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${emphasisClass} ${className}`}
        style={style}
      >
        {children}
      </tr>
    );
  }
  if (!onActivate) {
    return (
      <tr {...data} aria-rowindex={rowIndex} className={`${emphasisClass} ${className}`} style={style}>
        {children}
      </tr>
    );
  }
  // A press that lands on a control inside the row (a button, a link) is that control's, not the row's.
  const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
    const control = (event.target as Element).closest('button, a, input, select, textarea');
    if (control && event.currentTarget.contains(control)) return;
    onActivate();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onActivate();
  };
  return (
    <tr
      {...data}
      data-row=""
      aria-rowindex={rowIndex}
      tabIndex={tabStop ? 0 : -1}
      aria-selected={selected}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`cursor-pointer hover:*:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${selected ? 'bg-[var(--row-selected)]' : ''} ${emphasisClass} ${className}`}
      style={style}
    >
      {children}
    </tr>
  );
}

// Holds the place of rows a caller does not draw (the rows above and below a windowed list), `height` px tall and `columns` wide. It is
// hidden from assistive technology: `Table rowCount` and `TableRow rowIndex` say where the drawn rows stand.
export function TableSpacer({ height, columns }: { height: number; columns: number }) {
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={columns} className="p-0" />
    </tr>
  );
}

const CELL_ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

// A column header, muted (4.5:1 or better on the panel and page backgrounds; the faint text token missed it). `align="right"` for a numeric column, `align="center"` over cells that are centred, and the cells under it say so too. With `onSort` it is a sortable
// column: a button sorts by it and the header announces its state (`aria-sort`, `sorted` says which way, and it is `none` when
// the table is sorted by another column). The arrow beside the label repeats it for the eye; the button is named by the label.
export function TableHeader({
  align = 'left',
  sorted,
  onSort,
  hiddenLabel,
  info,
  className = '',
  style,
  children,
}: {
  align?: keyof typeof CELL_ALIGN;
  sorted?: 'ascending' | 'descending';
  onSort?: () => void;
  // The name of a column with no visible header (a column of buttons), for a screen reader.
  hiddenLabel?: string;
  // Definition text for an "i" icon after the label (a non-obvious column, e.g. what it counts or as of when).
  info?: string;
  className?: string;
  style?: CSSProperties;
  children?: string;
}) {
  const arrow = sorted === 'ascending' ? '↑' : sorted === 'descending' ? '↓' : '';
  return (
    <th
      scope="col"
      aria-sort={onSort ? (sorted ?? 'none') : undefined}
      className={`relative ${TABLE_HEADER_CLASS} ${CELL_ALIGN[align]} ${className}`}
      style={style}
    >
      {onSort ? (
        <button
          type="button"
          aria-label={children}
          onClick={onSort}
          className={`inline-flex items-center gap-1 ${sorted ? 'text-[var(--accent-strong)]' : 'text-inherit'}`}
        >
          {children} {arrow}
        </button>
      ) : children ? (
        info ? (
          // The label and its mark are one unit: a mark that is the cell's only element would read as a control spanning the cell (H2).
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {children}
            <Tooltip text={info} label={`About the ${children} column`} />
          </span>
        ) : (
          children
        )
      ) : (
        <span className="sr-only">{hiddenLabel}</span>
      )}
    </th>
  );
}

// A data cell. Content sits in the middle of the row; `valign="top"` for a cell of several lines beside one-line cells, so
// its first line stays level with theirs. `numeric` is a number, a time or a level: IBM Plex Mono at 13 px, right-aligned
// unless `align="left"` says otherwise (its header takes the same align) and never broken. `muted` is secondary text (the mocks' source column): 12 px in
// `--text-muted`, which meets 4.5:1 where the mocks' `--non-text` would not.
export function TableCell({
  align,
  valign = 'middle',
  numeric = false,
  muted = false,
  colSpan,
  className = '',
  style,
  children,
}: {
  align?: keyof typeof CELL_ALIGN;
  valign?: 'middle' | 'top';
  numeric?: boolean;
  muted?: boolean;
  colSpan?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const right = align === 'right' || (numeric && align !== 'left' && align !== 'center');
  return (
    <td
      colSpan={colSpan}
      className={`${TABLE_CELL_CLASS} ${valign === 'top' ? 'align-top' : 'align-middle'} ${right ? CELL_ALIGN.right : align === 'center' ? CELL_ALIGN.center : ''} ${numeric ? "font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8125rem] whitespace-nowrap" : ''} ${muted ? 'text-[0.75rem] text-[var(--text-muted)]' : ''} ${className}`}
      style={style}
    >
      {children}
    </td>
  );
}
