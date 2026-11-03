// A toast whose message is one long unbroken word (a Windows path is the realistic case) wraps inside the window instead of running off both edges (#2793).
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { clickNav } from './drivers/shared';

// 230 characters with no space: the Booth's failed chapter read is toasted by `useErrorToast`, which cuts a message at 240.
const LONG_PATH = `C:\\Users\\narrator\\Documents\\Audiobooks\\${'VeryLongProjectFolderName\\'.repeat(8)}schedule.json`;

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`a long unbroken toast message stays inside the window: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((message) => {
        (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
          manuscriptChapters: async () => Promise.reject(new Error(message)),
        };
      }, LONG_PATH);
      await page.goto('/');
      await settlePage(page);
      await clickNav(page, 'Booth');
      const toast = page.locator('[data-tone="error"]').first();
      await toast.waitFor();
      const box = (await toast.boundingBox())!;
      expect(box.x, 'left edge is on screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'right edge is on screen').toBeLessThanOrEqual(width);
      // The dismiss button is still reachable, and the text is wrapped inside the box rather than overflowing it.
      const dismiss = (await toast.getByRole('button', { name: 'Dismiss message' }).boundingBox())!;
      expect(dismiss.x + dismiss.width).toBeLessThanOrEqual(width);
      expect(await toast.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    });
  }
}
