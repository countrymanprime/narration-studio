// One toast region (#1765): App and the overlay host each mounted a ToastRegion, both fixed bottom-right. At runtime, in the real build, on the
// project picker, Production, the Booth with its footer, two stacked toasts (one with Retry) and a toast raised while a dialog is open, there is exactly one
// region, it holds the raised toasts, it is on screen, and it does not cover the Booth's footer. Pictures: screenshots/toast-region/<theme>/<case>/<viewport>.png.
import { expect, test, type Page } from '@playwright/test';
import { VIEWPORTS, REFLOW_VIEWPORT } from './viewports';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
import { boothChapterReady } from './helpers/viewTop';

const SIZES = [...VIEWPORTS, REFLOW_VIEWPORT];
const regions = (page: Page) => page.locator('[data-toast-region]');

type Case = { name: string; open: (page: Page) => Promise<void>; footer?: boolean; toasts: number; action?: 'Undo' | 'Retry' };
const CASES: Case[] = [
  {
    name: 'picker',
    toasts: 1,
    action: 'Undo',
    open: async (page) => {
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      await page.getByRole('button', { name: /^Remove Voltage and the Undercroft from recent projects/ }).click();
      await page.getByRole('button', { name: 'Undo' }).waitFor();
    },
  },
  {
    name: 'production',
    toasts: 1,
    open: async (page) => {
      await page.goto('/?mockProfileRead=fails');
      await settlePage(page);
      await goToPage(page, 'Master & QC');
      await page.locator('[data-tone="error"]').first().waitFor();
      await goToPage(page, 'Production');
    },
  },
  {
    // A sticky error raised on Master & QC stays up when the narrator goes to the Booth, whose footer the region must rise above.
    name: 'booth-footer',
    toasts: 1,
    footer: true,
    open: async (page) => {
      await page.goto('/?mockProfileRead=fails');
      await settlePage(page);
      await goToPage(page, 'Master & QC');
      await page.locator('[data-tone="error"]').first().waitFor();
      await goToPage(page, 'Booth');
      await page.locator('[data-tone="error"]').first().waitFor();
    },
  },
  {
    name: 'stacked-with-retry',
    toasts: 2,
    action: 'Retry',
    open: async (page) => {
      await page.goto('/?mockChapters=fails&mockProfileRead=fails');
      await settlePage(page);
      await goToPage(page, 'Master & QC');
      await expect.poll(() => page.locator('[data-tone="error"]').count()).toBeGreaterThanOrEqual(2);
      await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
    },
  },
  {
    name: 'with-dialog',
    toasts: 1,
    action: 'Undo',
    open: async (page) => {
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      await page.getByRole('button', { name: /^Remove Voltage and the Undercroft from recent projects/ }).click();
      await page.getByRole('button', { name: 'Undo' }).waitFor();
      await page.getByRole('button', { name: 'New project' }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
];

/** Waits for the layout to settle after a resize: two frames, then the region's box the same twice running. */
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await regions(page).boundingBox());
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  for (const c of CASES) {
    test(`one toast region, with its toasts, on screen and clear of the footer: ${c.name}, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      let first = true;
      for (const size of SIZES) {
        await page.setViewportSize({ width: size.width, height: size.height });
        if (first) {
          await c.open(page);
          first = false;
        }
        await settleLayout(page);
        await expect(regions(page)).toHaveCount(1);
        // Not an empty wrapper: the raised toasts are in that one region, visible, with text.
        const toasts = regions(page).locator('[data-tone]');
        await expect.poll(() => toasts.count(), `${size.name}: toasts in the region`).toBeGreaterThanOrEqual(c.toasts);
        for (let i = 0; i < (await toasts.count()); i += 1) {
          await expect(toasts.nth(i)).toBeVisible();
          expect(((await toasts.nth(i).textContent()) ?? '').trim().length, `${size.name}: toast ${i} has text`).toBeGreaterThan(0);
        }
        const region = (await regions(page).boundingBox())!;
        expect(region.x, `${size.name}: left edge on screen`).toBeGreaterThanOrEqual(0);
        expect(region.y, `${size.name}: top edge on screen`).toBeGreaterThanOrEqual(0);
        expect(region.x + region.width, `${size.name}: right edge on screen`).toBeLessThanOrEqual(size.width);
        expect(region.y + region.height, `${size.name}: bottom edge on screen`).toBeLessThanOrEqual(size.height);
        if (c.action) {
          const buttons = regions(page).getByRole('button', { name: c.action });
          await expect(buttons.first()).toBeVisible();
          for (let i = 0; i < (await buttons.count()); i += 1) {
            const box = (await buttons.nth(i).boundingBox())!;
            expect(box.x, `${size.name}: ${c.action} ${i} left`).toBeGreaterThanOrEqual(0);
            expect(box.y, `${size.name}: ${c.action} ${i} top`).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width, `${size.name}: ${c.action} ${i} right`).toBeLessThanOrEqual(size.width);
            expect(box.y + box.height, `${size.name}: ${c.action} ${i} bottom`).toBeLessThanOrEqual(size.height);
            // Reachable: the topmost element at its centre is the button (or inside it), not a scrim or a bar.
            const top = await buttons.nth(i).evaluate((b) => {
              const r = b.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return hit !== null && b.contains(hit);
            });
            expect(top, `${size.name}: ${c.action} ${i} is the topmost element at its centre`).toBe(true);
          }
        }
        if (c.footer) {
          await boothChapterReady(page);
          // The app's own measure of the bars along the bottom (useToastClearance): the region rises above them by that much.
          const clear = await page.evaluate(() => Number.parseFloat(document.documentElement.style.getPropertyValue('--toast-clear')) || 0);
          expect(clear, `${size.name}: the Booth's bottom bars set the clearance`).toBeGreaterThan(0);
          expect(region.y + region.height, `${size.name}: the region ends above the bars`).toBeLessThanOrEqual(size.height - clear + 1);
        }
        await page.screenshot({ path: `screenshots/toast-region/${theme}/${c.name}/${size.name}.png` });
      }
    });
  }
}

test('the project picker and Production each draw exactly one toast region at runtime', async ({ page }) => {
  await page.goto('/?mockNoProject=1');
  await settlePage(page);
  await expect(regions(page)).toHaveCount(1);
  await page.goto('/');
  await settlePage(page);
  await page.getByRole('heading', { level: 1, name: 'Production' }).waitFor();
  await expect(regions(page)).toHaveCount(1);
});

// A toast raised before a modal opens stays pressable: it is portalled to <body> above the scrim, so the modal does not hide it from the pointer.
test('a toast raised before a dialog opens can still be pressed while the dialog is open', async ({ page }) => {
  await CASES.find((c) => c.name === 'with-dialog')!.open(page);
  await regions(page).getByRole('button', { name: 'Undo' }).click();
  await expect(regions(page).getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});

// What the overlay queue changed, run in the real build: an information toast goes by itself, an error stays until dismissed.
test('an information toast expires on its own and an error stays until dismissed', async ({ page }) => {
  await CASES.find((c) => c.name === 'picker')!.open(page);
  await expect(regions(page).locator('[data-tone="info"]')).toHaveCount(1);
  await expect(regions(page).locator('[data-tone="info"]')).toHaveCount(0, { timeout: 9_000 });
  await page.goto('/?mockProfileRead=fails');
  await settlePage(page);
  await goToPage(page, 'Master & QC');
  const error = regions(page).locator('[data-tone="error"]').first();
  await error.waitFor();
  await page.waitForTimeout(6_500);
  await expect(error).toBeVisible();
  await error.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(regions(page).locator('[data-tone="error"]').filter({ hasText: 'delivery profiles' })).toHaveCount(0);
});

test('the same error raised again is one toast, not two', async ({ page }) => {
  await page.goto('/?mockProfileRead=fails');
  await settlePage(page);
  await goToPage(page, 'Master & QC');
  const same = regions(page).locator('[data-tone="error"]').filter({ hasText: 'delivery profiles' });
  await same.waitFor();
  await same.getByRole('button', { name: 'Retry' }).click();
  await expect(same.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(same).toHaveCount(1);
});

// A toast raised while a modal is open (#2949) and Tab in a modal (#2948), at the smallest window.
test.describe('a modal with a toast showing, 320x300', () => {
  test.use({ viewport: { width: 320, height: 300 } });
  const inDialog = (page: Page) => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"], [data-toast-region]')));

  test('its buttons are hit-testable, Tab reaches the toast’s Undo, and 25 Tabs never leave the dialog and toast', async ({ page }) => {
    await CASES.find((c) => c.name === 'with-dialog')!.open(page);
    for (const button of await page.getByRole('dialog').getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y]) => Boolean(document.elementFromPoint(x!, y!)?.closest('[data-toast-region]')),
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(hit, await button.innerText()).toBe(false);
    }
    const seen = new Set<string>();
    for (let press = 0; press < 25; press++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(40);
      expect(await inDialog(page)).toBe(true);
      seen.add(await page.evaluate(() => (document.activeElement?.closest('[data-toast-region]') ? 'toast' : 'dialog')));
    }
    expect([...seen].sort()).toEqual(['dialog', 'toast']);
  });
});
