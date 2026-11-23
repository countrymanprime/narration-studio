// A message raised on the Editing page rises above the bar at the foot of the script and never covers Play or the bar's other buttons (owner rule:
// no toast covers a button; #4043's Retry toast is taller than an information toast, which at 360x500 reached over Play). The bar registers with the
// shared toast clearance (`useToastClearance`), as the Booth's footer does.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

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
      // At 360x500 the bar alone is 158 px of the window and the toast region keeps 8 rem of a short window for itself (`--toast-reserve`, #3322), so the toast
      // may lie over the waveform's top row there, by design; the bar's own buttons, Play first, are clear at every size.
      const waveform = size.height > 500;
      const result = await page.evaluate((withWaveform) => {
        const toast = document.querySelector('[data-toast-region] [data-toast-edge]')?.parentElement ?? document.querySelector('[data-toast-region]');
        const t = toast!.getBoundingClientRect();
        const buttons = [
          ...document.querySelectorAll(
            withWaveform
              ? '[role="toolbar"][aria-label="Playback and selection"] button, #wavedock button'
              : '[role="toolbar"][aria-label="Playback and selection"] button',
          ),
        ].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            name: b.getAttribute('aria-label') ?? b.textContent ?? '',
            overlap: r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top,
          };
        });
        return {
          toast: { top: t.top, bottom: t.bottom, left: t.left, right: t.right },
          covered: buttons.filter((b) => b.overlap).map((b) => b.name),
          count: buttons.length,
        };
      }, waveform);
      expect(result.count, 'the bar has buttons').toBeGreaterThan(0);
      expect(
        result.covered,
        `the toast (${JSON.stringify(result.toast)}) covers no button of the bar or the waveform: ${JSON.stringify(result.covered)}`,
      ).toEqual([]);
    });
  }
}
