import { expect, type Locator } from '@playwright/test';

// The overlay guard (definition of done, rule 1): an overlay must be the topmost thing at each of its own points and fully on screen. It is one
// helper so every page can use the same check; PR #1756's guard (branch fix/booth-resiliency) may replace it once that is on main.
//
// `elementFromPoint` skips an element with `pointer-events: none`, which a tooltip has, so the overlay's own pointer events are switched on while
// the points are read and put back after. The points are the four corners (inset 14 px, inside the rounded corners), the middle of each side and the
// centre of the overlay's box.

type OverlayCheck = {
  name: string;
  box: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  covered: string[];
};

async function measureOverlay(overlay: Locator, name: string): Promise<OverlayCheck> {
  return overlay.evaluate((root, label) => {
    const rect = root.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const previous = (root as HTMLElement).style.pointerEvents;
    (root as HTMLElement).style.pointerEvents = 'auto';
    const inset = 14;
    const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
    const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
    const covered: string[] = [];
    for (const x of xs) {
      for (const y of ys) {
        // A point off screen cannot be hit; the on-screen check reports it.
        if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
        const top = document.elementFromPoint(x, y);
        if (!top || !root.contains(top))
          covered.push(
            `(${Math.round(x)}, ${Math.round(y)}) is ${top ? `${top.tagName.toLowerCase()}${top.className ? `.${String(top.className).split(' ')[0]}` : ''}` : 'nothing'}`,
          );
      }
    }
    (root as HTMLElement).style.pointerEvents = previous;
    return { name: label, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport, covered };
  }, name);
}

/** Fails when any point of the overlay is covered by something else, or any part of it is off screen. */
export async function expectOverlayTopmostAndOnScreen(overlay: Locator, name: string): Promise<void> {
  await expect(overlay).toBeVisible();
  const check = await measureOverlay(overlay, name);
  const { box, viewport } = check;
  const off = box.x < -0.5 || box.y < -0.5 || box.x + box.width > viewport.width + 0.5 || box.y + box.height > viewport.height + 0.5;
  expect(check.covered, `${name}: covered at ${check.covered.join('; ')}`).toEqual([]);
  expect(off, `${name} is partly off screen: ${JSON.stringify(box)} in ${viewport.width}x${viewport.height}`).toBe(false);
}
