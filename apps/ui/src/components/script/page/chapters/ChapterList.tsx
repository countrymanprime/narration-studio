import { useRef, useState, type KeyboardEvent } from 'react';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import type { PrepState } from '../../../../api/contracts/scriptPrep';
import { IconButton } from '../../../primitives/IconButton';
import { Panel } from '../../../primitives/Panel';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { useMarks, useScriptPrep } from '../data/useScriptData';
import { chapterHeading } from '../../../../chapterHeading';
import { PrepDot } from './PrepDot';
import { PrepLegend } from './PrepLegend';

/** The roving list's id for the credits row, which no chapter's id can be. */
const CREDITS_STOP = 'credits:opening';
const ROW_CLASS = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm';

// The mock's chapter list: a roving-focus list (one tab stop; Up, Down, Home and End move) with each chapter's prep dot, label and
// title, a "?" pill where a query is open, the chapter in view marked, and the key to the dots. `onClose` is given where the list
// is a drawer (narrow widths): it draws the close button and closes after a jump.
export function ChapterList({
  chapters,
  currentId,
  onJump,
  onClose,
  openingCredits,
}: {
  chapters: readonly ManuscriptChapter[];
  currentId: string | null;
  onJump: (chapterId: string) => void;
  onClose?: () => void;
  /** The mock's "Opening credits" row above the first chapter, for the credits card the reader draws; omitted where the manuscript lists its own. */
  openingCredits?: { state: PrepState; onJump: () => void };
}) {
  const prep = useScriptPrep();
  const marks = useMarks();
  const asking = new Set(marks.openQueries.map((mark) => mark.chapterId));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState<string | null>(null);
  // The roving list's stops, in order: the credits row (when drawn), then every chapter.
  const stops = [...(openingCredits ? [CREDITS_STOP] : []), ...chapters.map((chapter) => chapter.id)];
  const stop = stops.includes(focused ?? '') ? focused : chapters.some((chapter) => chapter.id === currentId) ? currentId : (stops[0] ?? null);

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

  return (
    <Panel title="Chapters" titleStyle="caps" flush scroll actions={onClose && <IconButton action="close" size="sm" onClick={onClose} />} className="min-h-0">
      <ul aria-label="Chapters" onKeyDown={onKeyDown} className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-auto p-2">
        {openingCredits && (
          <li key={CREDITS_STOP}>
            {/* native-control-ok: a roving-focus list row (prep dot, title) that Button's padded chrome does not fit */}
            <button
              type="button"
              ref={(node) => {
                if (node) buttons.current.set(CREDITS_STOP, node);
                else buttons.current.delete(CREDITS_STOP);
              }}
              tabIndex={CREDITS_STOP === stop ? 0 : -1}
              onFocus={() => setFocused(CREDITS_STOP)}
              onClick={() => {
                openingCredits.onJump();
                onClose?.();
              }}
              className={`${ROW_CLASS} text-[var(--text)] hover:bg-[var(--surface-2)]`}
            >
              <PrepDot state={openingCredits.state} />
              <span className="min-w-0 flex-1">Opening credits</span>
            </button>
          </li>
        )}
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
                tabIndex={chapter.id === stop ? 0 : -1}
                aria-current={current || undefined}
                onFocus={() => setFocused(chapter.id)}
                onClick={() => {
                  onJump(chapter.id);
                  onClose?.();
                }}
                className={`${ROW_CLASS} ${current ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
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
      </ul>
      <PrepLegend />
    </Panel>
  );
}
