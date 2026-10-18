import { useEffect } from 'react';

/**
 * Scrolls to, focuses and lights up the row another page asked for, once it is on screen. `ready` says the row can exist (its category is shown
 * and its Advanced section open); `done` is called when it has been handled so the request is not repeated. The light fades after a moment;
 * with reduced motion it simply stays until the next navigation.
 */
export function useDeepLink(target: string | null, ready: boolean, done: () => void, setLit: (rowId: string | null) => void): void {
  useEffect(() => {
    if (!target || !ready) return undefined;
    const element = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(target)}"]`);
    if (!element) return undefined;
    element.scrollIntoView?.({ block: 'center' });
    // The row's own control first; a row with a custom body has none by that id, so the first thing in its control column.
    const control =
      element.querySelector<HTMLElement>(`[id="set-${target}"]`) ?? element.querySelector<HTMLElement>('input, select, button, [role="radio"], [tabindex]');
    control?.focus({ preventScroll: true });
    setLit(target);
    done();
    // Not cleared on the next render: handling the request clears `target`, which re-runs this effect.
    window.setTimeout(() => setLit(null), 2200);
    return undefined;
  }, [target, ready, done, setLit]);
}
