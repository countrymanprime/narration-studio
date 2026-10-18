// `<html data-motion="reduce">` while Windows asks for reduced motion (`prefers-reduced-motion: reduce`), absent unless something else set it. The `motion-ok:`
// variant in styles.css reads the media query and this attribute together, so the attribute is what lets a test, and the in-app
// setting that follows, turn motion off without the operating system's help (docs/design/design-system.md#motion).

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether motion is reduced right now: Windows asks for it, or `<html data-motion="reduce">` is set. For the code that moves things in
 * JavaScript (the Booth's follow scroll and paced cursor); the CSS side reads the same two through the `motion-ok:` variant.
 */
export function motionReduced(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'reduce') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Sets `data-motion="reduce"` on `root` from the media query and keeps it in step when the preference changes. Returns the function
 * that stops listening. Where there is no `matchMedia` (jsdom) the attribute is left as it is.
 */
export function syncMotionAttribute(root: HTMLElement = document.documentElement, win: Window = window): () => void {
  if (typeof win.matchMedia !== 'function') return () => undefined;
  const media = win.matchMedia(REDUCED_MOTION_QUERY);
  // Only an attribute this function set is ever removed: a `data-motion="reduce"` that was already there (a test's, or the in-app setting's) stays.
  let owned = false;
  const apply = (reduce: boolean): void => {
    if (reduce) {
      root.setAttribute('data-motion', 'reduce');
      owned = true;
    } else if (owned) {
      root.removeAttribute('data-motion');
      owned = false;
    }
  };
  apply(media.matches);
  const onChange = (event: MediaQueryListEvent): void => apply(event.matches);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
