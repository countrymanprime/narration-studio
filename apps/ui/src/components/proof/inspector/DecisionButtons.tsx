import type { FindingReviewStatus } from '../../../types';
import { Button } from '../../primitives/Button';
import { KeyCap } from '../../primitives/KeyCap';
import type { FixKind } from '../resolution';

const DECISIONS: ReadonlyArray<{ label: string; key: string; status: FindingReviewStatus; fix?: FixKind }> = [
  { label: 'Needs pickup', key: 'P', status: 'accepted', fix: 'pickup' },
  { label: 'Fix in edit', key: 'E', status: 'accepted', fix: 'edit' },
  { label: 'Waive', key: 'W', status: 'dismissed' },
  { label: 'Defer', key: 'D', status: 'deferred' },
];

/**
 * The Studio Next Inspector's decision group (mock `.decide`): Needs pickup, Fix in edit, Waive and Defer in two columns of equal 40 px
 * buttons, each with its key cap at the right, the pressed one outlined in copper. Any of the four can be pressed on any note. The stored
 * status is the finding's own review status: both of the first two are `accepted`, so the one pressed is the fix the note's kind asks
 * for (`fix`, from `fixKindOf`); a note's kind never turns a button off. Waive is `dismissed`. The keys themselves are registered by the page.
 */
export function DecisionButtons({
  status,
  fix,
  disabled = false,
  pendingStatus,
  onDecide,
}: {
  status: FindingReviewStatus;
  fix: FixKind;
  /** The evidence changed or another action is running: every button is inert. */
  disabled?: boolean;
  /** The status being saved, if any. */
  pendingStatus?: FindingReviewStatus;
  onDecide: (status: FindingReviewStatus) => void;
}) {
  return (
    <div role="group" aria-label="Resolution" className="grid grid-cols-2 gap-2">
      {DECISIONS.map((decision) => {
        const pressed = status === decision.status && (decision.fix === undefined || decision.fix === fix);
        return (
          <Button
            key={decision.label}
            variant="secondary"
            size="lg"
            aria-pressed={pressed}
            disabled={disabled}
            pending={pendingStatus === decision.status}
            className={`justify-between ${pressed ? 'outline-2 outline-offset-1 outline-[var(--accent)]' : ''}`}
            onClick={() => onDecide(decision.status)}
          >
            {decision.label}
            <KeyCap k={decision.key} />
          </Button>
        );
      })}
    </div>
  );
}
