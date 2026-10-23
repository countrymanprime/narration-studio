import { Button } from '../../../primitives/Button';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TooltipTarget } from '../../../primitives/Tooltip';

/** A footer button that is off with its reason: the reason is the tooltip and the group's name, as the Split control does it. */
function Gated({ reason, children }: { reason?: string; children: React.ReactNode }) {
  return reason === undefined ? <>{children}</> : <TooltipTarget text={reason}>{children}</TooltipTarget>;
}

/** One prep step the suggestion would be surer for. With a `reason` the DAW or the page cannot run it now. */
export function PrepStepButton({ id, label, reason, onRun }: { id: string; label: string; reason?: string; onRun: () => void }) {
  return (
    <Gated reason={reason}>
      <Button variant="secondary" size="sm" disabled={reason !== undefined} data-prep={id} onClick={onRun}>
        {label}
      </Button>
    </Gated>
  );
}

/** A step that ran in this session and no longer shows as needed. */
export const PrepStepDone = ({ id, label }: { id: string; label: string }) => (
  <span data-prep-done={id} className="inline-flex">
    <StatusBadge tone="success" label={`${label}: done`} shape="tag" />
  </span>
);

/** The figures are being measured again, or could not be: never the old ones shown as the new. */
export function PrepStatus({ state }: { state: 'updating' | 'stale' }) {
  return (
    <span role="status" data-prep-status={state} className="text-[var(--text-muted)]">
      {state === 'updating' ? 'Updating the figures…' : 'The figures could not be measured again, so none are shown.'}
    </span>
  );
}

/** Hide the other takes, or look at the hidden ones. */
export function HideButton({ label, reason, onPress, id }: { label: string; reason?: string; onPress: () => void; id: string }) {
  return (
    <Gated reason={reason}>
      <Button variant="secondary" size="sm" disabled={reason !== undefined} data-thide={id} onClick={onPress}>
        {label}
      </Button>
    </Gated>
  );
}
