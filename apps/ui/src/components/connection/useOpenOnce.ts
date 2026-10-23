import { useCallback, useEffect, useRef, useState } from 'react';

/** Keys already opened by themselves. Module-wide, so leaving the page and coming back does not open a dialog the narrator already dismissed. */
const opened = new Set<string>();

/** Forgets every key (tests, so one test's dialog does not stay "already shown" for the next). */
export function resetOpenOnce(): void {
  opened.clear();
}

/**
 * Whether a resolve dialog is open. It opens by itself the first time `key` is seen and never again for that key: the narrator who closed it
 * reopens it from the indicator (`reopen`). `key` names the condition and what it is about (`reaper-off:REAPER`, `unlinked:ch-3`); `null`
 * means the condition is gone, which forgets the key so the next time it happens counts as new. While `hold` is true (another dialog is up, or the
 * app is still connecting on its own) nothing opens and the key stays unseen, so it opens when the hold ends if the condition still stands.
 */
export function useOpenOnce(key: string | null, hold = false): { open: boolean; reopen: () => void; close: () => void } {
  const [state, setState] = useState<{ key: string | null; open: boolean }>({ key: null, open: false });

  useEffect(() => {
    setState((prev) => {
      if (key === null) {
        if (prev.key !== null) opened.delete(prev.key);
        return prev.key === null ? prev : { key, open: false };
      }
      if (opened.has(key)) return prev.key === key ? prev : { key, open: false };
      // Held: the key stays unseen, so the hold ending is what opens it.
      if (hold) return prev;
      opened.add(key);
      return { key, open: true };
    });
  }, [key, hold]);

  // The narrator's own press counts as the dialog having been shown, even while an automatic opening is held back.
  const reopen = useCallback(() => {
    if (key === null) return;
    opened.add(key);
    setState({ key, open: true });
  }, [key]);
  const close = useCallback(() => setState((prev) => ({ ...prev, open: false })), []);
  // The first paint after the condition appears has no state yet: nothing is open until the effect has decided.
  return { open: state.key === key && state.open && key !== null, reopen, close };
}

/**
 * Reopens a dialog each time `asked` changes after mount: the page counts the presses of the action this dialog's condition stops (Record),
 * so every press shows the fix. The count a notice mounts with is history and opens nothing.
 */
export function useReopenOnAsk(asked: number, reopen: () => void): void {
  const seen = useRef(asked);
  useEffect(() => {
    if (asked === seen.current) return;
    seen.current = asked;
    reopen();
  }, [asked, reopen]);
}
