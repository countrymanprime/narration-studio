import { useCallback, useEffect, useRef, useState } from 'react';

// "This changed": the row, cell or entry an action or an Undo just changed fades from --accent-soft to its own background
// over --motion-highlight, once. Under reduced motion it is tinted --accent-soft, still, for as long as its flag is on.
// Nothing moves (docs/design/motion-and-animation.md). A Proof decision does not use it (#1456, Q5).
export const CHANGE_HIGHLIGHT_CLASSES =
  'motion-ok:animate-[change-highlight_var(--motion-highlight)_var(--ease-standard)] motion-still:bg-[var(--accent-soft)]';

// A failure or a stale notice arriving: it fades in once on the base token when it mounts, then stays still.
export const ARRIVE_CLASSES = 'motion-ok:animate-[arrive_var(--motion-base)_var(--ease-enter)]';

/** How long a "just changed" flag stays on: past the highlight's fade, and long enough to read the still tint. */
export const JUST_CHANGED_MS = 1600;

/**
 * Which item an action just changed, for `CHANGE_HIGHLIGHT_CLASSES`. `mark(id)` turns the flag on for that id and restarts its
 * timer; a later `mark` moves it. The timer is cleared on unmount.
 */
export function useJustChanged(ms: number = JUST_CHANGED_MS): { changed: string | null; mark: (id: string) => void } {
  const [changed, setChanged] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mark = useCallback(
    (id: string) => {
      clearTimeout(timer.current);
      setChanged(id);
      timer.current = setTimeout(() => setChanged(null), ms);
    },
    [ms],
  );
  return { changed, mark };
}
