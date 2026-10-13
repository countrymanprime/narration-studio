import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { IconButton } from '../../../primitives/IconButton';
import { InsetCard } from '../../../primitives/InsetCard';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { WPH } from '../../../schedule/estimates';
import { useChapterFacts } from '../data/useScriptData';
import { cardLabel, chapterHeading, endedName } from '../../../../chapterHeading';
import { PrepSegment } from './PrepSegment';

const words = (n: number): string => n.toLocaleString('en-US');

/** A changed-since-import notice the host raised for a chapter; the card draws it only when one is given (`ManuscriptChapter` carries none today). */
export type ChapterReview = { text: string; onMarkReviewed: () => void };

/** What the boundary above a card names: the chapter (or the credits) before it and its words. */
export type Ended = { name: string; words: number };

/** The mock's dashed "End of {name} · N words" line between two chapters. */
export function EndOf({ ended }: { ended: Ended }) {
  return (
    <div className="flex items-center gap-3 pb-3.5 font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)] uppercase before:flex-1 before:border-t-2 before:border-dashed before:border-[var(--line-strong)] before:content-[''] after:flex-1 after:border-t-2 after:border-dashed after:border-[var(--line-strong)] after:content-['']">
      <span>
        End of {ended.name} · {words(ended.words)} words
      </span>
    </div>
  );
}

// The mock's chapter boundary in the reader: "End of {previous} · N words", then the card with the label and Record in Booth, the
// title, the words, the finished minutes and the facts line, the "My prep" control and the review banner. Record in Booth is the
// host's: no `onRecord`, no button (a chapter that is not narration).
export function ChapterCard({
  chapter,
  previous,
  ended,
  onRecord,
  review,
}: {
  chapter: ManuscriptChapter;
  previous?: ManuscriptChapter;
  /** The boundary above a card with no chapter before it: the opening credits drawn above the first chapter. */
  ended?: Ended;
  onRecord?: (chapterId: string) => void;
  review?: ChapterReview;
}) {
  const facts = useChapterFacts();
  const { title } = chapterHeading(chapter);
  return (
    <div data-chapter-id={chapter.id} className="flex flex-col">
      {previous ? <EndOf ended={{ name: endedName(previous), words: previous.wordCount }} /> : ended && <EndOf ended={ended} />}
      <InsetCard as="section" fill aria-label={title} className="flex flex-col gap-2 font-sans">
        <div className="flex items-center justify-between gap-2">
          <span className="font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[0.08em] text-[var(--text-muted)] uppercase">
            {cardLabel(chapter)}
          </span>
          {onRecord && <IconButton action="recordInBooth" onClick={() => onRecord(chapter.id)} />}
        </div>
        <h2 className="font-['Barlow_Condensed',sans-serif] text-[1.625rem] font-semibold">{title}</h2>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          {words(chapter.wordCount)} words · about {Math.round((chapter.wordCount / WPH) * 60)} min finished audio · {facts(chapter.id)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SectionLabel>My prep</SectionLabel>
          <PrepSegment chapter={chapter} />
        </div>
        {review && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn-text)]">
            <span className="flex-1">{review.text}</span>
            <IconButton action="markReviewed" onClick={review.onMarkReviewed} />
          </div>
        )}
      </InsetCard>
    </div>
  );
}
