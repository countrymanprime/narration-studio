import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TooltipTarget } from '../../../primitives/Tooltip';
import { confidenceWhy, pct, type ConfidenceContext } from './selectors';

/**
 * The confidence as a percent, and "No score" when the source gave none (never filled in). At or above the line it is the success tone,
 * filled and marked with a tick; under it, or with no score, the warning tone, hollow and marked with a bang, so the two differ by
 * shape and not by colour alone. The tip and the accessible name give the percent, the quote and the reason.
 */
export function ConfidenceChip({ suggestion, context }: { suggestion: ExtractionSuggestion; context?: ConfidenceContext }) {
  const checked = suggestion.status === 'needs-verification';
  const why = confidenceWhy(suggestion, context);
  const label = suggestion.confidence === null ? 'No score' : `${pct(suggestion.confidence)}%`;
  return (
    <TooltipTarget text={why}>
      <span role="img" tabIndex={0} aria-label={`${suggestion.confidence === null ? 'No confidence' : label}. ${why}`} data-conf={suggestion.id}>
        <StatusBadge tone={checked ? 'warning' : 'success'} look={checked ? 'outline' : 'soft'} icon={checked ? '!' : '✓'} label={label} />
      </span>
    </TooltipTarget>
  );
}
