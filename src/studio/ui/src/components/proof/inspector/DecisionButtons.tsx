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
 * The Studio Next Inspector's decision group: Needs pickup, Fix in edit, Waive and Defer, each with its key cap. The stored status is
 * the finding's own review status: both of the first two are `accepted` and the fix the note asks for (`fix`, from
 * `fixKindOf`) says which one is pressed. Any of the four can be pressed on any note (the mock's group is a two-column grid of equal
 * buttons); the fix is still the note kind's, so Fix in edit on a pickup-kind note saves the decision and the note stays a pickup.
 * Waive is `dismissed` and shown as Waived. The keys themselves are registered by the page.
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
            className={`justify-between ${pressed ? 'outline-2 outline-offset-1 outline-[var(--accent)]' : ''}`}
            aria-pressed={pressed}
            disabled={disabled}
            pending={pendingStatus === decision.status}
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
