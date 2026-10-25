// The card look Panel draws, measured on benchmark mock
// 05 and the Studio Next mock's `.panel`: a 1 px `--border` frame at the card radius (10 px) on `--surface`, with no shadow (the mock draws none); a header row 50 px tall with its divider,
// the same with or without a button in it (PanelHeader's actions take 5 px of the padding above and below, so a 36 px button fits and sibling
// cards' dividers line up), its content 16 px in from the frame; and a 16 px body.
// A surface that is not a `section` (a TabPanel drawn as a card) takes these from here rather than copying them.

// `overflow-clip` keeps a flush table's square rows and fills inside the rounded corners. Clip, not hidden: it makes no scroll container, so a
// sticky header inside still sticks to the page's scroller.
export const PANEL_FRAME_CLASS = 'overflow-clip rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]';

export const PANEL_HEADER_CLASS =
  'flex min-h-[3.125rem] flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--border)] px-4 py-[0.6875rem]';

// The body's padding, as a custom property too, so a `Table flush` inside it can span exactly that much.
export const PANEL_BODY_CLASS = 'p-[var(--panel-pad)] [--panel-pad:1rem]';

// The title breaks inside a word only when the word alone is wider than its line (`break-word`, not `anywhere`, which let a
// squeezed title fold one letter per line).
// The card title: Barlow Condensed at the card-title size (19 px), semibold, `--text`.
export const PANEL_TITLE_CLASS =
  "min-w-0 font-['Barlow_Condensed',sans-serif] text-[length:var(--font-size-card-title)] leading-[1.2] font-semibold text-[var(--text)] [overflow-wrap:break-word]";

// The title of a Dialog and a SlideOver: one token, `--font-size-overlay-title` (24 px, the Studio Next mock's `.dlg .dh h2`), Barlow Condensed
// semibold like a card title and larger than one, so a panel's own name is not the smallest heading on it (alignment audit ENX-13, R3EN2-10).
export const OVERLAY_TITLE_CLASS =
  "min-w-0 font-['Barlow_Condensed',sans-serif] text-[length:var(--font-size-overlay-title)] leading-[1.2] font-semibold text-[var(--text)] [overflow-wrap:break-word]";

// The Story Bible entry's name (the Studio Next mock, pages/bible/EntryEditor.tsx): the card title at 26 px.
export const PANEL_ENTRY_TITLE_CLASS =
  "min-w-0 font-['Barlow_Condensed',sans-serif] text-[1.625rem] leading-[1.2] font-semibold text-[var(--text)] [overflow-wrap:break-word]";

// The caps title the dark Settings mocks draw over a category (delivery-platform-profiles 05 and 09, input-commands 01):
// Barlow Condensed 17 px, semibold, uppercase, tracked 0.08 em.
export const PANEL_CAPS_TITLE_CLASS =
  "min-w-0 font-['Barlow_Condensed',sans-serif] text-[1.0625rem] leading-[1.2] font-semibold tracking-[0.08em] text-[var(--text)] uppercase [overflow-wrap:break-word]";

// The subtitle sits on the title's line, 10 px after it: Plex Sans 13 px, muted. It keeps to that line and wraps inside
// its own box while it has 10 rem, and only then drops under the title.
export const PANEL_SUBTITLE_CLASS = 'min-w-0 flex-[1_1_10rem] text-[0.8125rem] text-[var(--text-muted)] [overflow-wrap:anywhere]';
