import { expect, test, type Page } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// Tab onto a scrolling list in the render approval (the FX chain, the files and regions) shows where the keyboard is, in a short window too: at least 40 px of the list (all of a
// shorter one) is inside the window and the topmost thing there, not under the pinned action row or below the dialog's edge, and at least 40 px of its focus ring's left and right
// sides are drawn, inside every ancestor that clips (#3605 item 3: the ring was offscreen at 275x200 and under the action row at 320x261; drawn outside the list, it was clipped
// by the panel's frame at every window size, so no ring showed at all).
/** The focused scrolling list: how much of it is in view and topmost, and how much of each side of its focus ring is drawn. Null when focus is on anything else. */
const focusedList = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'group') return null;
    const box = el.getBoundingClientRect();
    // The rows of the list that are the topmost thing at its horizontal middle: neither outside the window nor under the action row.
    let visible = 0;
    for (let y = Math.ceil(box.top) + 1; y < box.bottom; y += 1) {
      if (y < 0 || y >= window.innerHeight) continue;
      const hit = document.elementFromPoint(box.left + box.width / 2, y);
      if (hit && el.contains(hit)) visible += 1;
    }
    // The ring's left and right sides, at the middle of the outline's stroke: drawn where no clipping ancestor cuts them and nothing else is on top.
    const style = getComputedStyle(el);
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth) / 2;
    const clips: DOMRect[] = [];
    for (let up = el.parentElement; up; up = up.parentElement) if (getComputedStyle(up).overflowY !== 'visible') clips.push(up.getBoundingClientRect());
    const drawn = (x: number) => {
      let count = 0;
      for (let y = Math.ceil(box.top) + 1; y < box.bottom; y += 1) {
        if (y < 0 || y >= window.innerHeight || clips.some((clip) => x < clip.left || x >= clip.right || y < clip.top || y >= clip.bottom)) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (el.contains(hit) || hit.contains(el))) count += 1;
      }
      return count;
    };
    const ring = style.outlineStyle === 'none' ? 0 : Math.min(drawn(box.left - reach), drawn(box.right + reach - 1));
    return {
      name: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? '',
      visible,
      ring,
      height: Math.round(box.height),
      top: Math.round(box.top),
    };
  });

const SIZES = [
  [320, 261],
  [320, 262],
  [275, 200],
  [320, 300],
  [320, 400],
  [400, 420],
  [1440, 900],
] as const;

for (const [width, height] of SIZES) {
  test(`Master / Tab onto the approval's lists keeps each in view / ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['to-spec-approve-daw']!(page);
    await page.setViewportSize({ width, height });
    const dialog = page.getByRole('alertdialog');
    const lists = await dialog.getByRole('group').count();
    expect(lists, 'the approval has its two lists').toBeGreaterThanOrEqual(2);
    const seen = new Set<string>();
    for (let tabs = 0; tabs < 12 && seen.size < lists; tabs += 1) {
      await page.keyboard.press('Tab');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const focused = await focusedList(page);
      if (!focused) continue;
      seen.add(focused.name);
      expect(focused.visible, `${focused.name}: ${focused.visible} px of ${focused.height} in view (top ${focused.top})`).toBeGreaterThanOrEqual(
        Math.min(40, focused.height - 2),
      );
      expect(focused.ring, `${focused.name}: ${focused.ring} px of each side of its focus ring drawn`).toBeGreaterThanOrEqual(Math.min(40, focused.height - 2));
    }
    expect(seen.size, 'Tab reached every list').toBe(lists);
  });
}

// The Story Bible's entry card builds the same scrolling body (`PANEL_SCROLL_BODY_CLASS`): its ring was clipped the same way.
test("Story Bible / the entry card's scrolling body shows its focus ring / 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  const card = page.locator('section > [role="group"][tabindex="0"]').first();
  await card.focus();
  // Out and back by keyboard, so the ring is the keyboard's.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(card).toBeFocused();
  const focused = await focusedList(page);
  expect(focused?.ring, `${focused?.ring} px of each side of the entry card's focus ring drawn`).toBeGreaterThanOrEqual(40);
});
