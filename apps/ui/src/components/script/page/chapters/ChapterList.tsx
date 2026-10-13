import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import type { PrepState } from '../../../../api/contracts/scriptPrep';
import { IconButton } from '../../../primitives/IconButton';
import { PanelHeader } from '../../../primitives/Panel';
import { PANEL_FRAME_CLASS } from '../../../primitives/panelStyles';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { useMarks, useScriptPrep } from '../data/useScriptData';
import { chapterHeading } from '../../../../chapterHeading';
import { CREDITS_LABEL, type CreditsKind } from '../../../booth/readerModel';
import { PrepDot } from './PrepDot';
import { PrepLegend } from './PrepLegend';
import { CREDITS_STOP, chapterListStops } from '../../../credits/creditsRows';

const ROW_CLASS = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm';
const CURRENT_CLASS = (current: boolean) =>
  current ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'text-[var(--text)] hover:bg-[var(--surface-2)]';

// The mock's chapter list: a roving-focus list (one tab stop; Up, Down, Home and End move) with each chapter's prep dot, label and
// title, a "?" pill where a query is open, the chapter in view marked, and the key to the dots under the part that scrolls. `onClose`
// is given where the list is a drawer (narrow widths): only then is the "Chapters" title drawn, with the close button, and a jump closes it.
export function ChapterList({
  chapters,
  currentId,
  onJump,
  onClose,
  openingCredits,
  closingCredits,
}: {
  chapters: readonly ManuscriptChapter[];
  currentId: string | null;
  onJump: (chapterId: string) => void;
  onClose?: () => void;
  /** The mock's "Opening credits" row above the first chapter, for the credits card the reader draws; omitted where the manuscript lists its own. */
  openingCredits?: CreditsRow;
  /** The mock's "Closing credits" row after the last chapter, for the closing card the reader draws there. */
  closingCredits?: CreditsRow;
}) {
  const prep = useScriptPrep();
  const marks = useMarks();
  const asking = new Set(marks.openQueries.map((mark) => mark.chapterId));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState<string | null>(null);
  const stops = chapterListStops(
    chapters.map((chapter) => chapter.id),
    { opening: openingCredits, closing: closingCredits },
  );
  const stop = stops.includes(focused ?? '') ? focused : currentId !== null && stops.includes(currentId) ? currentId : (stops[0] ?? null);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const at = stops.findIndex((id) => id === stop);
    const to =
      event.key === 'ArrowDown'
        ? Math.min(stops.length - 1, at + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, at - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? stops.length - 1
              : null;
    if (to === null || at < 0 || !stops[to]) return;
    event.preventDefault();
    setFocused(stops[to]);
    buttons.current.get(stops[to])?.focus();
  };

  const rowProps = { buttons: buttons.current, stop, currentId, onFocus: setFocused, onClose };
  const titleId = useId();

  return (
    <section
      aria-labelledby={onClose ? titleId : undefined}
      aria-label={onClose ? undefined : 'Chapters'}
      className={`${PANEL_FRAME_CLASS} flex h-full min-h-0 flex-col overflow-hidden`}
    >
      {onClose && <PanelHeader title="Chapters" titleId={titleId} titleStyle="caps" actions={<IconButton action="close" size="sm" onClick={onClose} />} />}
      <ul aria-label="Chapters" onKeyDown={onKeyDown} className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-auto p-2">
        {openingCredits && <CreditsItem kind="opening" row={openingCredits} {...rowProps} />}
        {chapters.map((chapter) => {
          const current = chapter.id === currentId;
          const { label, title } = chapterHeading(chapter);
          return (
            <li key={chapter.id}>
              {/* native-control-ok: a roving-focus list row (prep dot, two lines, pill) that Button's padded chrome does not fit */}
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(chapter.id, node);
                  else buttons.current.delete(chapter.id);
                }}
                data-jump={chapter.id}
                tabIndex={chapter.id === stop ? 0 : -1}
                aria-current={current || undefined}
                onFocus={() => setFocused(chapter.id)}
                onClick={() => {
                  onJump(chapter.id);
                  onClose?.();
                }}
                className={`${ROW_CLASS} ${CURRENT_CLASS(current)}`}
              >
                <PrepDot state={prep.prepOf(chapter.id)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  {label && (
                    <span className="font-['Barlow_Condensed',sans-serif] text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--text-muted)] uppercase">
                      {label}
                    </span>
                  )}
                  <span>{title}</span>
                </span>
                {asking.has(chapter.id) && (
                  <span role="img" aria-label="Open queries" title="Open queries">
                    <StatusBadge tone="warning" label="?" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {closingCredits && <CreditsItem kind="closing" row={closingCredits} {...rowProps} />}
      </ul>
      <PrepLegend />
    </section>
  );
}

type CreditsRow = { state: PrepState; onJump: () => void };

/** A credits row in the roving list: its prep dot and name, one of the list's stops. */
function CreditsItem({
  kind,
  row,
  buttons,
  stop,
  currentId,
  onFocus,
  onClose,
}: {
  kind: CreditsKind;
  row: CreditsRow;
  buttons: Map<string, HTMLButtonElement>;
  stop: string | null;
  currentId: string | null;
  onFocus: (id: string) => void;
  onClose?: () => void;
}) {
  const id = CREDITS_STOP[kind];
  const current = id === currentId;
  return (
    <li>
      {/* native-control-ok: a roving-focus list row (prep dot, title) that Button's padded chrome does not fit */}
      <button
        type="button"
        ref={(node) => {
          if (node) buttons.set(id, node);
          else buttons.delete(id);
        }}
        data-jump={id}
        tabIndex={id === stop ? 0 : -1}
        aria-current={current || undefined}
        onFocus={() => onFocus(id)}
        onClick={() => {
          row.onJump();
          onClose?.();
        }}
        className={`${ROW_CLASS} ${CURRENT_CLASS(current)}`}
      >
        <PrepDot state={row.state} />
        <span className="min-w-0 flex-1">{CREDITS_LABEL[kind]}</span>
      </button>
    </li>
  );
}
