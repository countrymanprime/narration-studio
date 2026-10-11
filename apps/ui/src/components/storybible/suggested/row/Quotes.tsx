import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { Button } from '../../../primitives/Button';
import { TooltipTarget } from '../../../primitives/Tooltip';

/** How a quote reaches its line: the page that mounts the row knows the Script, the row does not. */
export type EvidenceLinks = {
  /** Opens the paragraph in the Script. */
  onGoToEvidence: (paragraphId: string) => void;
  /** The chapter and line of a paragraph, for the quote's tip ("Chapter 8 · line 13"). */
  lineLabel: (paragraphId: string) => string;
};

/** The quotes a suggestion rests on, each a button that goes to its line, or the quote the source gave that is not in the text. */
export function Quotes({ suggestion, onGoToEvidence, lineLabel }: { suggestion: ExtractionSuggestion } & EvidenceLinks) {
  const { evidence, unverifiedQuote } = suggestion;
  return (
    <>
      {evidence.map((quote) => {
        const tip = `Go to the line in the Script · ${lineLabel(quote.paragraphId)}`;
        return (
          <TooltipTarget key={`${quote.paragraphId}:${quote.start}`} text={tip} className="min-w-0">
            <Button
              variant="link"
              aria-label={`${tip}: “${quote.text}”`}
              data-evidence={quote.paragraphId}
              className="text-left text-sm break-words"
              onClick={() => onGoToEvidence(quote.paragraphId)}
            >
              “{quote.text}”
            </Button>
          </TooltipTarget>
        );
      })}
      {!evidence.length && unverifiedQuote ? (
        <span className="text-sm text-[var(--text-muted)]" data-noquote>
          Quote not found in the text: “{unverifiedQuote}”
        </span>
      ) : null}
    </>
  );
}
