import { SectionLabel } from '../../primitives/SectionLabel';
import type { Around } from './paragraphsAround';

const NEIGHBOUR = 'line-clamp-2 text-sm text-[var(--text-muted)] [overflow-wrap:anywhere]';

/**
 * Show where's text (research note A4, A5): the note's paragraph with its words marked, and the paragraphs before and after, muted and
 * cut to two lines. `reason` says why there is no paragraph to show; with neither it draws nothing. Each paragraph keeps its own
 * direction (`dir="auto"`), so a right-to-left line reads as written.
 */
export function SurroundingText({ around, reason }: { around: Around | undefined; reason?: string }) {
  if (!around) return reason ? <p className="text-sm text-[var(--text-muted)]">{reason}</p> : null;
  const { at, mark } = around;
  return (
    <section aria-label="In the script" className="flex flex-col gap-1">
      <SectionLabel as="h3">In the script</SectionLabel>
      {around.before !== undefined && (
        <p data-around="before" dir="auto" className={NEIGHBOUR}>
          {around.before}
        </p>
      )}
      <p data-around="at" dir="auto" className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">
        {mark ? (
          <>
            {at.slice(0, mark.start)}
            <mark className="rounded-sm bg-[var(--accent-soft)] px-0.5 text-[var(--text)]">{at.slice(mark.start, mark.end)}</mark>
            {at.slice(mark.end)}
          </>
        ) : (
          at
        )}
      </p>
      {around.after !== undefined && (
        <p data-around="after" dir="auto" className={NEIGHBOUR}>
          {around.after}
        </p>
      )}
    </section>
  );
}
