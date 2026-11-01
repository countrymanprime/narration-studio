// The one width policy for a data page (#2654). A page of tables and cards (Master & QC, Delivery, Pickups) is a single column that fills the
// window up to 96 rem (1,536 px) and is centred beyond it, so a wide window does not stretch a table's text column across it with its
// status and actions at the far edge, and every data page ends at the same edges. A workspace page (Script, Booth, Editing, Proof) is not
// one: its reading column is `ReaderColumn`, and its panes fill the window.
export const PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-[96rem]';
