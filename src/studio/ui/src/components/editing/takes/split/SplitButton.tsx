import { Button } from '../../../primitives/Button';

/** The "Split into takes" control in the footer of a line's takes. With a `reason` the DAW cannot cut now: the button stays focusable and says the capability's sentence on focus. */
export function SplitButton({ reason, onSplit }: { reason?: string; onSplit: () => void }) {
  return (
    <Button variant="secondary" size="sm" disabledReason={reason ?? ''} data-tsplit onClick={onSplit}>
      Split into takes
    </Button>
  );
}
