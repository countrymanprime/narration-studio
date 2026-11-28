import { useState } from 'react';

// Whether a menu has been closed and its exit has not ended: Escape, a pick or a press outside has closed it, and the popup stays drawn for its
// fast-motion exit (120 ms). A menu's items take no press then (`disabled={leaving}`): the highlighted one still has focus, so the Space of a chord or
// the Enter of a footswitch pressed inside the exit would press it (the Booth: Ctrl+Alt+Space picked a chapter and asked "Stop recording?", a footswitch
// Enter pressed "Roll again" with the take running). Call `track` from the menu's `onOpenChange`; it reads `open` as the menu's new state.
export function useLeaving(): readonly [leaving: boolean, track: (open: boolean) => void] {
  const [leaving, setLeaving] = useState(false);
  return [leaving, (open) => setLeaving(!open)];
}
