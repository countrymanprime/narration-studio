import { Button } from '../../../primitives/Button';
import { TooltipTarget } from '../../../primitives/Tooltip';

/** The "Split into takes" control in the footer of a line's takes. With a `reason` the DAW cannot cut now: the button is disabled and the hint is the capability's sentence. */
export function SplitButton({ reason, onSplit }: { reason?: string; onSplit: () => void }) {
  const button = (
    <Button variant="secondary" size="sm" disabled={reason !== undefined} data-tsplit onClick={onSplit}>
      Split into takes
    </Button>
  );
  return reason === undefined ? button : <TooltipTarget text={reason}>{button}</TooltipTarget>;
}
