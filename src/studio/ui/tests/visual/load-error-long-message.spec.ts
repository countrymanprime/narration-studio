// The "This page could not be loaded" card wraps one long unbroken word (a Windows path) inside itself instead of clipping it at the card's edge (#2796).
// `LoadErrorPanel` is the one card every page uses, so the Booth stands for all of them.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { clickNav } from './drivers/shared';

const LONG_PATH = `C:\\Users\\narrator\\Documents\\Audiobooks\\${'VeryLongProjectFolderName\\'.repeat(8)}manuscript.json`;

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`a long unbroken load error wraps inside its card: ${theme}, ${width}px`, async ({ page }) => {
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
      const alert = page.locator('p[role="alert"]').filter({ hasText: 'VeryLongProjectFolderName' });
      await alert.waitFor();
      expect(await alert.evaluate((el) => el.scrollWidth <= el.clientWidth), 'the text fits its own box').toBe(true);
      const box = (await alert.boundingBox())!;
      expect(box.x + box.width, 'the text box ends inside the window').toBeLessThanOrEqual(width);
      const card = await alert.evaluate((el) => {
        const rect = (el.closest('[class*="rounded"]') ?? el.parentElement!).getBoundingClientRect();
        return { right: rect.right };
      });
      expect(box.x + box.width, 'the text box ends inside its card').toBeLessThanOrEqual(card.right + 0.5);
    });
  }
}
