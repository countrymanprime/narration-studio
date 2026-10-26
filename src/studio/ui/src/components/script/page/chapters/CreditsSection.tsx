import { previewParts } from '../../../../creditsPreviewParts';
import { WARN_COLOUR } from '../../../../kinds/entityColour';
import type { CreditsRenderResult } from '../../../../api/contracts/credits';
import { CREDITS_LABEL, creditsParagraphs, type CreditsKind } from '../../../booth/readerModel';
import { CREDITS_STOP } from '../../../credits/creditsRows';
import { Button } from '../../../primitives/Button';
import { IconButton } from '../../../primitives/IconButton';
import { InsetCard } from '../../../primitives/InsetCard';
import { KindMark } from '../../../primitives/KindMark';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { useChapterFacts } from '../data/useScriptData';
import { CardFacts, EndOf, cardFacts, type Ended } from './ChapterCard';
import { PrepSegment } from './PrepSegment';

// The mock lists the credits as chapters (`fixtures/alice.ts`), so the reader draws them as one: the end of the chapter before, a card
// labelled "Credits" with Record in Booth, the title, the facts and "My prep", then the text the template renders. The section is a
// boundary of its own (`data-bound`, `data-ch` the credits' prep id), so the header names it and the chapter list marks it while it
// is at the top. The unresolved tokens and Fill in have no equivalent in the mock (D22) and sit in the card's banner row.
export function CreditsSection({
  kind,
  preview,
  ended,
  onRecord,
  onFillIn,
  bannerShown = false,
}: {
  kind: CreditsKind;
  /** The first template of this kind, rendered; absent while it is read. */
  preview?: CreditsRenderResult;
  /** The chapter the closing credits follow. */
  ended?: Ended;
  /** Record in Booth: drawn once there is something to read, as the Booth's own picker. */
  onRecord?: () => void;
  onFillIn?: () => void;
  /** The page's credits banner is showing above this card: it says what is missing and has Fill in, so the card's token strip is not drawn (XSC-15). */
  bannerShown?: boolean;
}) {
  const facts = useChapterFacts();
  const id = CREDITS_STOP[kind];
  const title = CREDITS_LABEL[kind];
  const count = preview?.words ?? 0;
  const lines = preview ? creditsParagraphs(kind, preview.text) : [];
  return (
    <>
      {/* A chapter boundary's gaps (the reader's `Section`): 48 px above the end-of line. At the top of the reader the 12 px is padding,
          inside the boundary a jump scrolls to, so the card keeps it under the header after Go to (XSC-16). */}
      <div data-bound="" data-ch={id} id={`ch-${id}`} data-credits-entry={kind} className={ended ? 'mt-12' : 'pt-3'}>
        <div className="flex flex-col">
          {ended && <EndOf ended={ended} />}
          <InsetCard as="section" fill frame="roomy" aria-label={title} className="flex flex-col gap-2 font-sans">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Credits</SectionLabel>
              {onRecord && count > 0 && <IconButton action="recordInBooth" label={`Record ${title} in Booth`} onClick={onRecord} />}
            </div>
            <h2 className="font-['Barlow_Condensed',sans-serif] text-[1.625rem] font-semibold">{title}</h2>
            <CardFacts facts={cardFacts(count, facts(id))} />
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel>My prep</SectionLabel>
              <PrepSegment chapter={{ id, title }} />
            </div>
            {preview && preview.unresolved.length > 0 && !bannerShown && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn-text)]">
                <span className="flex-1">
                  {preview.unresolved.length} unresolved token{preview.unresolved.length === 1 ? '' : 's'}: {preview.unresolved.join(', ')}
                </span>
                {onFillIn && (
                  <Button size="sm" variant="secondary" onClick={onFillIn}>
                    Fill in
                  </Button>
                )}
              </div>
            )}
          </InsetCard>
        </div>
      </div>
      {lines.map((line, i) => (
        // A paragraph of the reader's (`Para`): no inset of its own, so it starts at the card's edge, 12 px under the card.
        <div key={line.id} data-para={line.id} data-ch={id} className={`relative py-1.5 ${i === 0 ? 'mt-3' : ''}`}>
          <p className="m-0 whitespace-pre-line">
            {previewParts({ ...preview!, text: line.text }).map((part, i) =>
              typeof part === 'string' ? (
                <span key={i}>{part}</span>
              ) : (
                // An unfilled token is an entry still to review (D7): the warn tint and underline, as in Settings.
                <KindMark key={i} kind="entity" colour={WARN_COLOUR}>
                  [{part.token}]
                </KindMark>
              ),
            )}
          </p>
        </div>
      ))}
      {preview && !lines.length && <div className="mt-3 py-1.5 text-[var(--text-muted)]">Credits text appears here.</div>}
    </>
  );
}
