import { Fragment } from 'react';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { BoundaryMarker } from '../../../primitives/BoundaryMarker';
import { IconButton } from '../../../primitives/IconButton';
import { InsetCard } from '../../../primitives/InsetCard';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { WPH } from '../../../schedule/estimates';
import { useChapterFacts } from '../data/useScriptData';
import { cardLabel, chapterHeading, endedName, headingName } from '../../../../chapterHeading';
import { PrepSegment } from './PrepSegment';

const words = (n: number): string => n.toLocaleString('en-US');

/**
 * A card's facts line ("2,140 words · about 14 min finished audio · 0 notes · …"): it wraps between facts, never inside one, so
 * a count stays on the line of its label (alignment audit XSC-10). The dot is held to the fact before it.
 */
export function CardFacts({ facts }: { facts: readonly string[] }) {
  return (
    <p className="m-0 text-sm text-[var(--text-muted)]">
      {facts.map((fact, i) => (
        <Fragment key={i}>
          {i > 0 && '\u00a0· '}
          <span className="whitespace-nowrap">{fact}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** The facts of a card with `words` words, then the chapter's own (`useChapterFacts`, one string joined by " · "). */
export const cardFacts = (wordCount: number, chapterFacts: string): string[] => [
  `${words(wordCount)} words`,
  `about ${Math.round((wordCount / WPH) * 60)} min finished audio`,
  ...chapterFacts.split(' · '),
];

/** What the boundary above a card names: the chapter (or the credits) before it and its words. */
export type Ended = { name: string; words: number };

/** The mock's dashed "End of {name} · N words" line between two chapters, the same marker a Booth page break draws. */
export function EndOf({ ended }: { ended: Ended }) {
  return (
    <BoundaryMarker variant="chapterEnd" className="pb-3.5">
      End of {ended.name} · {words(ended.words)} words
    </BoundaryMarker>
  );
}

// The mock's chapter boundary in the reader: "End of {previous} · N words", then the card with the label and Record in Booth, the
// title, the words, the finished minutes and the facts line and the "My prep" control. Record in Booth is the
// host's: no `onRecord`, no button (a chapter that is not narration).
export function ChapterCard({
  chapter,
  previous,
  ended,
  onRecord,
}: {
  chapter: ManuscriptChapter;
  previous?: ManuscriptChapter;
  /** The boundary above a card with no chapter before it: the opening credits drawn above the first chapter. */
  ended?: Ended;
  onRecord?: (chapterId: string) => void;
}) {
  const facts = useChapterFacts();
  const { title } = chapterHeading(chapter);
  return (
    <div data-chapter-id={chapter.id} className="flex flex-col">
      {previous ? <EndOf ended={{ name: endedName(previous), words: previous.wordCount }} /> : ended && <EndOf ended={ended} />}
      <InsetCard
        as="section"
        fill
        frame="roomy"
        aria-label={`${headingName(chapter)}, chapter card`}
        className="flex flex-col gap-2 font-['IBM_Plex_Sans',ui-sans-serif,sans-serif]"
      >
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{cardLabel(chapter)}</SectionLabel>
          {onRecord && <IconButton action="recordInBooth" onClick={() => onRecord(chapter.id)} />}
        </div>
        <h2 className="font-['Barlow_Condensed',sans-serif] text-[1.625rem] leading-[1.45] font-semibold">{title}</h2>
        <CardFacts facts={cardFacts(chapter.wordCount, facts(chapter.id))} />
        <div className="flex flex-wrap items-center gap-3">
          <SectionLabel>My prep</SectionLabel>
          <PrepSegment chapter={chapter} />
        </div>
      </InsetCard>
    </div>
  );
}
