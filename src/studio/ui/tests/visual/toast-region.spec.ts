// One toast region (#1765): App and the overlay host each mounted a ToastRegion, both fixed bottom-right. At runtime, in the real build, on the
// project picker, Production, the Booth with its footer, two stacked toasts (one with Retry) and a toast raised while a dialog is open, there is exactly one
// region, it is on screen, and it does not cover the Booth's footer. Pictures: screenshots/toast-region/<theme>/<case>/<viewport>.png.
import { expect, test, type Page } from '@playwright/test';
import { VIEWPORTS, REFLOW_VIEWPORT } from './viewports';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
import { boothChapterReady } from './helpers/viewTop';

const SIZES = [...VIEWPORTS, REFLOW_VIEWPORT];
const regions = (page: Page) => page.locator('[data-toast-region]');

type Case = { name: string; open: (page: Page) => Promise<void>; footer?: boolean };
const CASES: Case[] = [
  {
    name: 'picker',
    open: async (page) => {
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      await page.getByRole('button', { name: /^Remove Voltage and the Undercroft from recent projects/ }).click();
      await page.getByRole('button', { name: 'Undo' }).waitFor();
    },
  },
  {
    name: 'production',
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

for (const theme of ['light', 'dark'] as const) {
  for (const c of CASES) {
    test(`one toast region, on screen and clear of the footer: ${c.name}, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      let first = true;
      for (const size of SIZES) {
        await page.setViewportSize({ width: size.width, height: size.height });
        if (first) {
          await c.open(page);
          first = false;
        }
        await expect(regions(page)).toHaveCount(1);
        const region = (await regions(page).boundingBox())!;
        expect(region.x, `${size.name}: left edge on screen`).toBeGreaterThanOrEqual(0);
        expect(region.y, `${size.name}: top edge on screen`).toBeGreaterThanOrEqual(0);
        expect(region.x + region.width, `${size.name}: right edge on screen`).toBeLessThanOrEqual(size.width);
        expect(region.y + region.height, `${size.name}: bottom edge on screen`).toBeLessThanOrEqual(size.height);
        if (c.footer) {
          await boothChapterReady(page);
          const bars = await page.evaluate(() =>
            [...document.querySelectorAll('footer, #brec-setup')].map((e) => {
              const r = e.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
            }),
          );
          for (const bar of bars.filter((b) => b.h > 0)) {
            const overlaps = region.x < bar.right && region.x + region.width > bar.left && region.y < bar.bottom && region.y + region.height > bar.top;
            expect(overlaps, `${size.name}: the region does not cover a bottom bar at ${JSON.stringify(bar)}`).toBe(false);
          }
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
