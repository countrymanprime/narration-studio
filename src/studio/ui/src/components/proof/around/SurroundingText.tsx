import type { KindId } from '../../../kinds/kindMap';
import { Highlight } from '../../primitives/Highlight';
import { kindMarkStyle } from '../../../kinds/markStyle';
import { KindMark } from '../../primitives/KindMark';
import { SectionLabel } from '../../primitives/SectionLabel';
import type { Around } from './paragraphsAround';

const NEIGHBOUR = 'line-clamp-2 text-sm text-[var(--text-muted)] [overflow-wrap:anywhere]';

/**
 * Show where's text (research note A4, A5): the note's paragraph with its words marked in the note's own kind (`kind`; the search
 * mark when it has none, or its kind draws no text mark, such as a breath or a noise), and the paragraphs before and after, muted and cut to two lines. `reason` says why there is no paragraph to show; with neither it draws nothing. Each paragraph keeps its own
 * direction (`dir="auto"`), so a right-to-left line reads as written.
 */
export function SurroundingText({ around, reason, kind }: { around: Around | undefined; reason?: string; kind?: KindId | null }) {
  if (!around) return reason ? <p className="text-sm text-[var(--text-muted)]">{reason}</p> : null;
  const { at, mark } = around;
  return (
    <section aria-label="In the script" className="flex flex-col gap-1">
      <SectionLabel>In the script</SectionLabel>
      {around.before !== undefined && (
        <p data-around="before" dir="auto" className={NEIGHBOUR}>
          {around.before}
        </p>
      )}
      <p data-around="at" dir="auto" className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">
        {mark ? (
          <>
            {at.slice(0, mark.start)}
            {kind && kindMarkStyle(kind) ? (
              <KindMark kind={kind}>{at.slice(mark.start, mark.end)}</KindMark>
            ) : (
              <Highlight kind="Search">{at.slice(mark.start, mark.end)}</Highlight>
            )}
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
