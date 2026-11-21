// Where the speaker picker (SN-B762) opens: at the speaker chip that was pressed, under it or above it where there is more room, and
// inside the window (`Popover` places it, as it does every popover). Escape, a choice or a press anywhere else closes it, and focus goes
// back to the chip.

import { useEffect, useRef, type ReactNode } from 'react';
import { Popover } from '../../../primitives/Popover';

const GAP = 6;

export function SpeakerLayer({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  // The page takes the layer away the moment it closes, before the popover could hand focus back itself.
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  return (
    <Popover anchor={anchor} label="Who says this" align="start" sideOffset={GAP} compact fitToWindow open onOpenChange={(open) => !open && onClose()}>
      {children}
    </Popover>
  );
}
