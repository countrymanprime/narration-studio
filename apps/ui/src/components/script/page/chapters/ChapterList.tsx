import { useRef, useState, type KeyboardEvent } from 'react';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { IconButton } from '../../../primitives/IconButton';
import { useMarks, useScriptPrep } from '../data/useScriptData';
import { chapterHeading } from './chapterHeading';
import { PrepDot } from './PrepDot';
import { PrepLegend } from './PrepLegend';

// The mock's chapter list: a roving-focus list (one tab stop; Up, Down, Home and End move) with each chapter's prep dot, label and
// title, a "?" pill where a query is open, the chapter in view marked, and the key to the dots. `onClose` is given where the list
// is a drawer (narrow widths): it draws the close button and closes after a jump.
export function ChapterList({
  chapters,
  currentId,
  onJump,
  onClose,
}: {
  chapters: readonly ManuscriptChapter[];
  currentId: string | null;
  onJump: (chapterId: string) => void;
  onClose?: () => void;
}) {
  const prep = useScriptPrep();
  const marks = useMarks();
  const asking = new Set(marks.openQueries.map((mark) => mark.chapterId));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState<string | null>(null);
  const stop = chapters.some((chapter) => chapter.id === focused)
    ? focused
    : chapters.some((chapter) => chapter.id === currentId)
      ? currentId
      : (chapters[0]?.id ?? null);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const at = chapters.findIndex((chapter) => chapter.id === stop);
    const to =
      event.key === 'ArrowDown'
        ? Math.min(chapters.length - 1, at + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, at - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? chapters.length - 1
              : null;
    if (to === null || at < 0 || !chapters[to]) return;
    event.preventDefault();
    setFocused(chapters[to].id);
    buttons.current.get(chapters[to].id)?.focus();
  };

  return (
    <section aria-label="Chapters" className="flex min-h-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <h2 className="font-['Barlow_Condensed',sans-serif] text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--text-muted)] uppercase">Chapters</h2>
        {onClose && <IconButton action="close" size="sm" onClick={onClose} />}
      </div>
      <ul aria-label="Chapters" onKeyDown={onKeyDown} className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-auto p-2">
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
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${current ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
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
                  <span
                    role="img"
                    aria-label="Open queries"
                    title="Open queries"
                    className="rounded-full bg-[var(--warn-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--warn-text)]"
                  >
                    ?
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <PrepLegend />
    </section>
  );
}
