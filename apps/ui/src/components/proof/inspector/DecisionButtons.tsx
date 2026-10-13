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

/** Why the other of Needs pickup and Fix in edit is off: the fix comes from the kind of note, never stored on its own (ADR 0470). */
export const OTHER_FIX: Record<FixKind, string> = {
  pickup: 'This kind of note is re-recorded, so it is a pickup, not a fix in the edit.',
  edit: 'This kind of note is fixed in the edit, so it is not a pickup.',
};

/**
 * The Studio Next Inspector's decision group: Needs pickup, Fix in edit, Waive and Defer, each with its key cap. The stored status is
 * the finding's own review status (ADR 0470): both of the first two are `accepted` and the fix the note asks for (`fix`, from
 * `fixKindOf`) says which one is pressed. The one that does not match the note's fix is off with `OTHER_FIX`, so a press never saves
 * the other fix in its name. Waive is `dismissed` and shown as Waived. The keys themselves are registered by the page.
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
    <div className="flex flex-col gap-1">
      <div role="group" aria-label="Resolution" className="flex flex-wrap gap-2">
        {DECISIONS.map((decision) => {
          const pressed = status === decision.status && (decision.fix === undefined || decision.fix === fix);
          const otherFix = decision.fix !== undefined && decision.fix !== fix;
          return (
            <Button
              key={decision.label}
              variant={pressed ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={pressed}
              disabled={disabled || otherFix}
              title={otherFix ? OTHER_FIX[fix] : undefined}
              pending={pendingStatus === decision.status}
              onClick={() => onDecide(decision.status)}
            >
              {decision.label}
              <KeyCap k={decision.key} />
            </Button>
          );
        })}
      </div>
      <p className="text-sm text-[var(--text-muted)]">{OTHER_FIX[fix]}</p>
    </div>
  );
}
