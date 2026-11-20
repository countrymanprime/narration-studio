import { useCallback, useEffect, useRef, useState } from 'react';

/** Keys already opened by themselves. Module-wide, so leaving the page and coming back does not open a dialog the narrator already dismissed. */
const opened = new Set<string>();

/** Forgets every key (tests, so one test's dialog does not stay "already shown" for the next). */
export function resetOpenOnce(): void {
  opened.clear();
  toldProblem = null;
}

/** The host's bridge problem the narrator was already told about, module-wide so another page mounting does not tell them again (#3668). */
let toldProblem: string | null = null;

/** Whether this bridge problem is news: true once per problem, until the host stops reporting it. */
export function takeBridgeProblem(problem: string | null, known = true): boolean {
  if (!problem) {
    // Only the host saying there is none forgets it: a page that has not heard from the host yet knows nothing.
    if (known) toldProblem = null;
    return false;
  }
  if (toldProblem === problem) return false;
  toldProblem = problem;
  return true;
}

/**
 * Whether a resolve dialog is open. It opens by itself the first time `key` is seen and never again for that key: the narrator who closed it
 * reopens it from the indicator (`reopen`). `key` names the condition and what it is about (`reaper-off:REAPER`, `unlinked:ch-3`); `null`
 * means the condition is gone, which forgets the key so the next time it happens counts as new. While `hold` is true (another dialog is up, or the
 * app is still connecting on its own) nothing opens and the key stays unseen, so it opens when the hold ends if the condition still stands.
 */
export function useOpenOnce(
  key: string | null,
  hold = false,
  { forgetOnUnmount = false }: { forgetOnUnmount?: boolean } = {},
): { open: boolean; reopen: () => void; close: () => void } {
  const [state, setState] = useState<{ key: string | null; open: boolean }>({ key: null, open: false });
  // A notice drawn only while its condition stands unmounts when the condition clears: with `forgetOnUnmount` that counts as the key going
  // away, so the condition coming back (another project opened again, the chapter unlinked again) opens the dialog again.
  useEffect(() => {
    if (!forgetOnUnmount || key === null) return;
    return () => {
      opened.delete(key);
    };
  }, [key, forgetOnUnmount]);

  // The module's `opened` set is changed here, in the effect, never inside a `setState` updater: React may call an updater twice (StrictMode in development), and
  // the second call would see the key already shown and keep the dialog shut, so in development the dialog never opened by itself (#3668).
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) {
      if (lastKey.current !== null) opened.delete(lastKey.current);
      lastKey.current = null;
      setState((prev) => (prev.key === null ? prev : { key, open: false }));
      return;
    }
    if (opened.has(key)) {
      lastKey.current = key;
      setState((prev) => (prev.key === key ? prev : { key, open: false }));
      return;
    }
    // Held: the key stays unseen, so the hold ending is what opens it.
    if (hold) return;
    opened.add(key);
    lastKey.current = key;
    setState({ key, open: true });
  }, [key, hold]);

  // The narrator's own press counts as the dialog having been shown, even while an automatic opening is held back.
  const reopen = useCallback(() => {
    if (key === null) return;
    opened.add(key);
    // Remembered like an automatic opening, so the condition going away forgets the key and the next loss asks again.
    lastKey.current = key;
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
