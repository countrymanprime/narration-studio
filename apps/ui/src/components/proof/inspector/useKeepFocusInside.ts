import { useEffect, useRef, type RefObject } from 'react';

/** What a focused control was, so its stand-in on the next note can be found by name when the control itself is replaced. */
type Held = { el: HTMLElement; group: string | null; name: string };

const nameOf = (el: HTMLElement) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
const enabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';

/**
 * Keeps focus inside a panel whose controls are replaced or switched off by what they do: a decision moves the Inspector to the next
 * note (its buttons are new elements), Reopen removes the button that was pressed, and a save turns every decision off for a moment. The
 * browser drops focus on <body> in all three. This puts it back on the same-named control, or the first enabled control of the same
 * group, and only when the narrator did not move focus away themselves (a control that is still there and on - or one nobody
 * pressed - is never touched). The Inspector lives under the panel's own `key`, so this watches the panel, not the Inspector.
 */
export function useKeepFocusInside(panel: RefObject<HTMLElement | null>): void {
  const detach = useRef<(() => void) | null>(null);
  const attached = useRef<HTMLElement | null>(null);

  // The panel is not on the page while the chapter loads, so it is looked for after every render and watched from the render it appears in.
  useEffect(() => {
    const root = panel.current;
    if (root === attached.current) return;
    detach.current?.();
    detach.current = null;
    attached.current = root;
    if (!root) return;
    let held: Held | null = null;
    let lost = false;
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      held = { el: event.target, group: event.target.closest('[role="group"]')?.getAttribute('aria-label') ?? null, name: nameOf(event.target) };
      lost = false;
    };
    const settle = () => {
      if (!held) return;
      const active = document.activeElement;
      if (active && active !== document.body) {
        if (!root.contains(active)) held = null; // the narrator went elsewhere
        return;
      }
      const gone = !held.el.isConnected;
      if (!gone && enabled(held.el) && !lost) return; // still there and on: the narrator blurred it themselves
      if (!gone && !enabled(held.el)) {
        lost = true; // switched off while saving: wait for it to come back
        return;
      }
      const scope = held.group ? [...root.querySelectorAll<HTMLElement>('[role="group"]')].find((g) => g.getAttribute('aria-label') === held?.group) : root;
      const candidates = [...(scope ?? root).querySelectorAll<HTMLElement>('button')].filter(enabled);
      const next = (gone ? undefined : held.el) ?? candidates.find((b) => nameOf(b) === held?.name) ?? candidates[0];
      if (!next || !next.isConnected) return;
      lost = false;
      next.focus();
    };
    root.addEventListener('focusin', onFocusIn);
    const watch = new MutationObserver(settle);
    watch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
    detach.current = () => {
      root.removeEventListener('focusin', onFocusIn);
      watch.disconnect();
    };
  });

  useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
      attached.current = null;
    },
    [],
  );
}
