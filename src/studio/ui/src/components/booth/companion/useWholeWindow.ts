import { useEffect } from 'react';

/**
 * While the companion shows, it is the whole window: everything else in `<body>` is hidden from assistive technology and
 * made inert, and given back exactly as it was on unmount. `CompactShell` brings its own `<main>`, which must not sit
 * beside the full app's own one (`landmark-no-duplicate-main`), and a narrow window has no room for the full app anyway.
 * The full app's own live regions are hidden with it; that is the booth's rule too - nothing interrupts the narrator here.
 */
export function useWholeWindow(root: HTMLElement | null) {
  useEffect(() => {
    if (!root) return;
    const hidden: { element: Element; ariaHidden: string | null }[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element === root || element.hasAttribute('inert')) continue;
      hidden.push({ element, ariaHidden: element.getAttribute('aria-hidden') });
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
    }
    return () => {
      for (const { element, ariaHidden } of hidden) {
        element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
    };
  }, [root]);
}
