// Where the speaker picker (SN-B762) opens: at the speaker chip that was pressed, under it or above it where there is more room, and
// inside the window (`Popover` places it, as it does every popover). Escape, a choice or a press anywhere else closes it, and focus goes
// back to the chip.

import type { ReactNode } from 'react';
import { Popover } from '../../../primitives/Popover';

const GAP = 6;

export function SpeakerLayer({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  return (
    <Popover anchor={anchor} label="Who says this" align="start" sideOffset={GAP} compact fitToWindow open onOpenChange={(open) => !open && onClose()}>
      {children}
    </Popover>
  );
}
