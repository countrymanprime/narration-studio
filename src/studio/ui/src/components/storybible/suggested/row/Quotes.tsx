import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { Button } from '../../../primitives/Button';
import { TooltipTarget } from '../../../primitives/Tooltip';

/** What `lineLabel` answers for a paragraph no chapter of the book names. */
export const LINE_NOT_FOUND = 'line not found';

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
        const where = lineLabel(quote.paragraphId);
        // A line the book no longer has cannot be opened: the quote stays readable and says so, instead of being a button that does nothing.
        if (where === LINE_NOT_FOUND) {
          return (
            <span key={`${quote.paragraphId}:${quote.start}`} className="min-w-0 text-sm break-words text-[var(--text-muted)]" data-noline>
              “{quote.text}” · line not found in the text
            </span>
          );
        }
        const tip = `Go to the line in the Script · ${where}`;
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
