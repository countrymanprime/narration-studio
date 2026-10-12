import { Button } from '../../primitives/Button';
import { TooltipTarget } from '../../primitives/Tooltip';
import { canStack, isStacked, movableTakes, type RetrySettings } from '../model/stacking';
import { RetryBar } from './RetryBar';
import { canCleanUp } from './stackedLine';
import { STACK_TEXT } from './stackText';
import type { StackLine } from './types';

export interface StackControlsProps {
  line: StackLine;
  settings: RetrySettings;
  /** Why stacking is off for the line (the DAW cannot, or a take is kept), or undefined. */
  reason: string | undefined;
  onStack: () => void;
  onUnstack: () => void;
  onCleanUp: () => void;
  /** The retry choice of the line changed. */
  onMode: () => void;
}

/** A button that is off with its reason as the hint, so a control the DAW cannot do still says why. */
function Action({ label, reason, onClick, attr }: { label: string; reason: string | undefined; onClick: () => void; attr: string }) {
  const button = (
    <Button variant="secondary" size="sm" disabled={reason !== undefined} {...{ [attr]: '' }} onClick={onClick}>
      {label}
    </Button>
  );
  return reason === undefined ? button : <TooltipTarget text={reason}>{button}</TooltipTarget>;
}

/**
 * What a line's takes offer about retries: how the line keeps them (the retry bar at the passage level, which carries the stack action under
 * stack), the un-stack of a stacked line, and the clean-up of the other reads once a take is kept in a line left in place.
 */
export function StackControls({ line, settings, reason, onStack, onUnstack, onCleanUp, onMode }: StackControlsProps) {
  const count = movableTakes(line).length;
  return (
    <div className="flex flex-wrap items-center gap-2" data-stack-controls={line.id}>
      <RetryBar
        level="passage"
        chapterId={line.chapterId}
        passageId={line.id}
        scope="passage"
        count={canStack(line) ? count : 0}
        reason={reason}
        onStack={onStack}
        onChange={onMode}
      />
      {isStacked(line) ? <Action label={STACK_TEXT.unstack} reason={reason} onClick={onUnstack} attr="data-unstack" /> : null}
      {canCleanUp(line, settings) ? <Action label={STACK_TEXT.cleanup} reason={undefined} onClick={onCleanUp} attr="data-cleanup" /> : null}
    </div>
  );
}
