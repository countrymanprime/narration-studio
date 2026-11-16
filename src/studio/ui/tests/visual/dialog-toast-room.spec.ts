// A toast over an open dialog never covers the dialog's title, its focused field or its action row in a window under 300 px tall (#3605 item 2, #3601, #3549).
// `ToastRegion` publishes `--toast-h` while a toast shows over a dialog and `Dialog` takes what is left above it in a window under 300 px tall. Each case opens a dialog under
// toasts the way the narrator meets them (one Undo toast over New project with its Name field focused; two stacked Undo toasts over it; one long error over the status report),
// then walks the window's heights from 261 to 299 px at 320 px wide and 262 to 299 px at 275 px wide: at five points of the title, of the focused field and of every button, the element
// at the point must not be in the toast region. A window 300 px tall or more keeps the static room (`toast-region.spec.ts`), and the dialog's size there is the sweep's (`dialog-height-sweep.spec.ts`).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { clickVisible } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 180_000 });

/** The points of every title, button and the focused field of the open dialog that a toast sits on: `label@x,y`. */
async function coveredPoints(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const popup = document.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!popup) return ['no dialog is open'];
    const focused = document.activeElement && popup.contains(document.activeElement) && document.activeElement !== popup ? document.activeElement : null;
    focused?.scrollIntoView({ block: 'nearest' });
    const frame = popup.getBoundingClientRect();
    const targets = [...popup.querySelectorAll('h1, h2, h3, button, [data-dialog-title]'), ...(focused ? [focused] : [])];
    const covered: string[] = [];
    for (const el of new Set(targets)) {
      const box = el.getBoundingClientRect();
      // Only the part the popup shows: a body that scrolls hides the rest, and what is scrolled away is not covered.
      const left = Math.max(box.left, frame.left, 0);
      const right = Math.min(box.right, frame.right, window.innerWidth);
      const top = Math.max(box.top, frame.top, 0);
      const bottom = Math.min(box.bottom, frame.bottom, window.innerHeight);
      if (right - left < 4 || bottom - top < 4) continue;
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName;
      const points: [number, number][] = [
        [(left + right) / 2, (top + bottom) / 2],
        [left + 2, top + 2],
        [right - 2, top + 2],
        [left + 2, bottom - 2],
        [right - 2, bottom - 2],
      ];
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-toast-region]')) covered.push(`${name}@${Math.round(x)},${Math.round(y)}`);
      }
    }
    return covered;
  });
}

type Case = { name: string; toasts: number; open: (page: Page) => Promise<void> };
const CASES: Case[] = [
  {
    name: 'New project with its Name field focused, one Undo toast',
    toasts: 1,
    open: async (page) => {
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      await page.getByRole('button', { name: /^Remove Voltage and the Undercroft from recent projects/ }).click();
      await page.getByRole('button', { name: 'Undo' }).waitFor();
      await page.getByRole('button', { name: 'New project' }).click();
      await page.getByRole('dialog').waitFor();
      await expect(page.getByRole('dialog').locator('input').first()).toBeFocused();
    },
  },
  {
    name: 'New project under two stacked Undo toasts',
    toasts: 2,
    open: async (page) => {
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      const remove = page.getByRole('button', { name: /^Remove .* from recent projects/ });
      await remove.first().click();
      await remove.first().click();
      await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(2);
      await page.getByRole('button', { name: 'New project' }).first().click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'the status report under a long error toast',
    toasts: 1,
    open: async (page) => {
      await page.goto('/?mockProduction=on-pace&mockOpenFolder=fail');
      await settlePage(page);
      await clickVisible(page, 'button', 'Export status report');
      await page.getByRole('dialog').waitFor();
      await clickVisible(page, 'button', 'Export');
      await clickVisible(page, 'button', 'Open the folder');
      await expect.poll(() => page.locator('[data-toast-region] [data-tone="error"]').count()).toBeGreaterThanOrEqual(1);
    },
  },
];

const SIZES: [number, number][] = [[275, 262], [275, 280], [275, 299], ...Array.from({ length: 39 }, (_, step): [number, number] => [320, 261 + step])];

for (const c of CASES) {
  test(`a toast never sits on the dialog's title, focused field or buttons under 300 px of height: ${c.name}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await c.open(page);
    const problems: string[] = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-h')), { message: `${width}x${height}: the room is published` })
        .not.toBe('');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const covered = await coveredPoints(page);
      if (covered.length) problems.push(`${width}x${height}: ${covered.join(', ')}`);
    }
    expect(problems).toEqual([]);
  });
}
