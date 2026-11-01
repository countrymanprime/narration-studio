// The look Table and StageGrid share, measured on
// benchmark mocks 01 and 05: a 31 px header row and 34 px body rows (the size tokens, rule and divider included), the
// label type over the columns, 10 px side padding and content in the middle of the row. A cell's `height` is the row's
// least height in a table, so a cell holding two lines, or a pill, still grows its row.

// A column header: Barlow Condensed at the label size and tracking, muted, no fill, always centred over its column (owner rule 5).
export const TABLE_HEADER_CLASS =
  "h-[var(--header-row-height)] border-b border-[var(--border)] px-2.5 py-0 text-center align-middle font-['Barlow_Condensed',sans-serif] text-[length:var(--font-size-label)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-muted)] uppercase";

// A body cell (a `td`, or a row's `th`). The row token sets the height; the 5 px above and below keep a 22 px status
// pill (StageGrid's cells) inside it too, where 6 px made a pill row 35 px.
export const TABLE_CELL_CLASS = 'h-[var(--row-height)] border-b border-[var(--border)] px-2.5 py-[0.3125rem]';

// The body text: IBM Plex Sans (the page's own face) at 14 px.
export const TABLE_TEXT_CLASS = 'text-[0.875rem]';

// The outer cells of a table at a card's edge. `--panel-pad` is the padding of the Panel body around the table: in a padded body the
// table is already 16 px in, so its outer cells keep their 10 px; in a `Panel flush` (pad 0) they take 16 px, and the last row's rule
// goes, since the card's border is the line there. Outside any panel the fallback (1rem) gives the ordinary cell.
export const TABLE_EDGES =
  '[&_tr>:first-child]:pl-[max(0.625rem,calc(1rem-var(--panel-pad,1rem)))] [&_tr>:last-child]:pr-[max(0.625rem,calc(1rem-var(--panel-pad,1rem)))] [&>tbody>tr:last-child>*]:border-b-[min(1px,var(--panel-pad,1rem))]';
// A `Table textEdges` puts its outer cells' text on the padded body's own text edge, keeping the last row's rule as a padded table does.
export const TABLE_TEXT_EDGES = '[&_tr>:first-child]:pl-0 [&_tr>:last-child]:pr-0 [&>tbody>tr:last-child>*]:border-b-[min(1px,var(--panel-pad,1rem))]';
// A `Table flush` spans the body's padding, so it is always at the card's edges.
export const TABLE_FLUSH_EDGES = '[&_tr>:first-child]:pl-4 [&_tr>:last-child]:pr-4 [&>tbody>tr:last-child>*]:border-b-0';
