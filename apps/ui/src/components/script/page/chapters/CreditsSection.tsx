import { previewParts } from '../../../../creditsPreviewParts';
import type { CreditsRenderResult } from '../../../../api/contracts/credits';
import { CREDITS_LABEL, creditsParagraphs, type CreditsKind } from '../../../booth/readerModel';
import { CREDITS_STOP } from '../../../credits/creditsRows';
import { Button } from '../../../primitives/Button';
import { IconButton } from '../../../primitives/IconButton';
import { InsetCard } from '../../../primitives/InsetCard';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { WPH } from '../../../schedule/estimates';
import { useChapterFacts } from '../data/useScriptData';
import { EndOf, type Ended } from './ChapterCard';
import { PrepSegment } from './PrepSegment';

const words = (n: number): string => n.toLocaleString('en-US');

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
}: {
  kind: CreditsKind;
  /** The first template of this kind, rendered; absent while it is read. */
  preview?: CreditsRenderResult;
  /** The chapter the closing credits follow. */
  ended?: Ended;
  /** Record in Booth: drawn once there is something to read, as the Booth's own picker. */
  onRecord?: () => void;
  onFillIn?: () => void;
}) {
  const facts = useChapterFacts();
  const id = CREDITS_STOP[kind];
  const title = CREDITS_LABEL[kind];
  const count = preview?.words ?? 0;
  const lines = preview ? creditsParagraphs(kind, preview.text) : [];
  return (
    <>
      <div data-bound="" data-ch={id} id={`ch-${id}`} data-credits-entry={kind} className="mt-6 first:mt-0">
        <div className="flex flex-col">
          {ended && <EndOf ended={ended} />}
          <InsetCard as="section" fill aria-label={title} className="flex flex-col gap-2 font-sans">
            <div className="flex items-center justify-between gap-2">
              <span className="font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[0.08em] text-[var(--text-muted)]">Credits</span>
              {onRecord && count > 0 && <IconButton action="recordInBooth" label={`Record ${title} in Booth`} onClick={onRecord} />}
            </div>
            <h2 className="font-['Barlow_Condensed',sans-serif] text-[1.625rem] font-semibold">{title}</h2>
            <p className="m-0 text-sm text-[var(--text-muted)]">
              {words(count)} words · about {Math.round((count / WPH) * 60)} min finished audio · {facts(id)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel>My prep</SectionLabel>
              <PrepSegment chapter={{ id, title }} />
            </div>
            {preview && preview.unresolved.length > 0 && (
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
      {lines.map((line) => (
        <div key={line.id} data-para={line.id} data-ch={id} className="relative pb-3 pl-8">
          <p className="m-0 whitespace-pre-line">
            {previewParts({ ...preview!, text: line.text }).map((part, i) =>
              typeof part === 'string' ? (
                <span key={i}>{part}</span>
              ) : (
                <span key={i} className="rounded-[0.15rem] bg-[var(--review-soft)] px-[0.15em] text-[var(--review-text)]">
                  [{part.token}]
                </span>
              ),
            )}
          </p>
        </div>
      ))}
      {preview && !lines.length && <div className="pl-8 text-[var(--text-muted)]">Credits text appears here.</div>}
    </>
  );
}
