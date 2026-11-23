// Proof's Hear it asks the DAW at once; when it cannot play, the app's own audio says why in a toast with Retry (#4076), never a line in the row.
// Owner rule: no toast covers a button (the shared slot, #4084).
import { expect, test } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';
import { coveredByToast } from './helpers/toastCover';

// The product's windows (960 px wide and up) and one tablet size, as `toast-covers-no-button.spec.ts`: a window 520 px tall or shorter keeps no toast slot.
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
  { width: 960, height: 700 },
  { width: 768, height: 1024 },
] as const;

for (const size of SIZES) {
  test(`Proof: Hear it's Retry toast covers no button (${size.width}x${size.height})`, async ({ page }) => {
    // The DAW's capabilities never answer and its loop refuses: the click still asks it, and the app plays with the reason and a Retry.
    await page.addInitScript(() => {
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
        dawCapabilities: () => new Promise(() => {}),
        findingsLoop: async () => ({ outcome: 'refused', reason: 'not_running', message: 'REAPER is not running.' }),
      };
    });
    await page.setViewportSize(size);
    await page.goto('/');
    await settlePage(page);
    await proofDrivers['default'](page);
    await page
      .getByRole('button', { name: /^Hear it/ })
      .first()
      .click();
    const toast = page.locator('[data-toast-region]');
    await toast.getByRole('button', { name: 'Retry' }).waitFor();
    await expect(
      page.locator('[role="alert"]:not([data-toast-region] *)').filter({ hasText: /Played in the app instead/ }),
      'the reason is not a line in the row',
    ).toHaveCount(0);
    await page.screenshot({ path: `test-results/play-retry-proof-${size.width}x${size.height}.png` });
    const result = await coveredByToast(page, { selector: 'button' });
    expect(result.count).toBeGreaterThan(0);
    expect(result.covered, `toast ${JSON.stringify(result.toast)} covers ${JSON.stringify(result.covered)}`).toEqual([]);
  });
}
