// A message raised on the Editing page rises above the bar at the foot of the script and never covers Play or the bar's other buttons (owner rule:
// no toast covers a button; #4043's Retry toast is taller than an information toast, which at 360x500 reached over Play). The bar registers with the
// shared toast clearance (`useToastClearance`), as the Booth's footer does.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { coveredByToast } from './helpers/toastCover';

const SIZES = [
  { width: 360, height: 500 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

/** An error toast with a Retry: the app's own audio cannot play, so Play says so. */
async function raiseRetryToast(page: Page): Promise<void> {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('no', 'NotSupportedError'));
  });
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  const bar = page.getByRole('toolbar', { name: 'Playback and selection' });
  await bar.waitFor();
  await bar.getByRole('button', { name: 'Play from here' }).click();
  await page.locator('[data-toast-region]').getByRole('button', { name: 'Retry' }).waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`Editing: the Retry toast covers no button of the bar or the waveform (${theme}, ${size.width}x${size.height})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize(size);
      await raiseRetryToast(page);
      // Every button of the bar and of the waveform dock, at every size, and the buttons above the script (read below).
      const result = await coveredByToast(page, { selector: '[role="toolbar"][aria-label="Playback and selection"] button, #wavedock button', topBand: 130 });
      expect(result.count, 'the bar has buttons').toBeGreaterThan(0);
      expect(
        result.covered,
        `the toast (${JSON.stringify(result.toast)}) covers no button of the bar or the waveform: ${JSON.stringify(result.covered)}`,
      ).toEqual([]);
    });
  }
}
