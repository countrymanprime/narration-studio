// The window-focus source the store uses by default. It is the same trigger as `useRefreshOnFocus`
// (components/stages/useRefreshOnFocus.ts): the window regains focus or the page becomes visible again, at most once per
// interval. It is copied and not imported because `src/studio/` may not import from `src/components/` (ADR 0770).

const FOCUS_THROTTLE_MS = 30_000;

export type FocusSource = (onFocus: () => void) => () => void;

export function windowFocusSource(throttleMs: number = FOCUS_THROTTLE_MS): FocusSource {
  return (onFocus) => {
    let last = 0;
    const trigger = () => {
      const now = Date.now();
      if (now - last < throttleMs) return;
      last = now;
      onFocus();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('focus', trigger);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  };
}
