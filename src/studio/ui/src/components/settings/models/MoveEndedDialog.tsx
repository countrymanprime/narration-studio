import type { ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import type { AssetMovePhase, AssetMoveState } from '../../../types';

/** The title of the dialog that tells how a move ended: the sentence is the title, so the dialog is not left saying it is still moving. */
const ENDED: Record<AssetMovePhase, (back: boolean) => string> = {
  success: (back) => (back ? 'The models were moved back' : 'The models were moved'),
  cancelled: () => 'The move was cancelled',
  error: () => 'The move failed',
  idle: () => '',
  copying: () => 'Moving models',
  verifying: () => 'Moving models',
  switching: () => 'Moving models',
};

/** How a finished move ended: its title says so, one sentence follows, and Close is the only button. A failure is announced as an alert. */
export function MoveEndedDialog({
  move,
  toDefault,
  path,
  onClose,
}: {
  move: AssetMoveState;
  toDefault: boolean;
  path: (value: string) => ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={ENDED[move.phase](toDefault)}
      dismissOnOutsidePress={false}
      actionsAlign="end"
      onEscape={onClose}
      actions={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="text-sm" role={move.phase === 'error' ? 'alert' : 'status'}>
        {move.phase === 'success' ? <>The models are in {path(move.target)} and in use.</> : move.error || move.message}
      </p>
    </Dialog>
  );
}
