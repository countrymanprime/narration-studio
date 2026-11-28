import { useCallback, useState } from 'react';

// Whether a menu has been closed and its exit has not ended: Escape, a pick or a press outside has closed it, and the popup stays drawn for its
// fast-motion exit (120 ms). A menu's items take no press then (`disabled={leaving}`): the highlighted one still has focus, so the Space of a chord or
// the Enter of a footswitch pressed inside the exit would press it (the Booth: Ctrl+Alt+Space picked a chapter and asked "Stop recording?", a footswitch
// Enter pressed "Roll again" with the take running). Call `track` from the menu's `onOpenChange`; it reads `open` as the menu's new state. A submenu
// closes on its own (Escape inside it closes only it), so each submenu root has its own, and because its trigger sits in a menu that stays open the
// trigger can be off only while it leaves: call `settle` from the root's `onOpenChangeComplete` to end that. The items keep their look while it leaves:
// style the muted state from the item being unavailable, never from `disabled`, or every row repaints for the exit.
export function useLeaving(): readonly [leaving: boolean, track: (open: boolean) => void, settle: () => void] {
  const [leaving, setLeaving] = useState(false);
  const track = useCallback((open: boolean) => setLeaving(!open), []);
  const settle = useCallback(() => setLeaving(false), []);
  return [leaving, track, settle];
}
