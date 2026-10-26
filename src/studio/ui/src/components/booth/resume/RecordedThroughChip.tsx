import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { RecordedThroughLabel } from '../../../recordedThrough';

/**
 * The Booth's top-bar note of how far the chapter is recorded (`recordedThrough`, the value Production, Editing and Proof show too):
 * "Recorded 45%", or "Complete" with a done dot once the recording covers the whole chapter. The last recorded words are in its tip
 * and its name ("Recorded through “…” (45%)"), and an estimate from the track's length says so.
 */
export function RecordedThroughChip({ label }: { label: RecordedThroughLabel }) {
  return (
    <TooltipTarget text={label.text}>
      <HeaderChip
        role="group"
        aria-label={label.text}
        tone={label.complete ? 'success' : 'neutral'}
        dot={label.complete ? 'var(--ok)' : undefined}
        className="flex-none"
      >
        <span data-recorded-through="">{label.complete ? label.short : `Recorded ${label.short}`}</span>
      </HeaderChip>
    </TooltipTarget>
  );
}
