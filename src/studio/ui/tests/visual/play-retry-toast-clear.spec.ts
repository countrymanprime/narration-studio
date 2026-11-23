// Proof's Hear it asks the DAW at once; when it cannot play, the app's own audio says why in a toast with Retry (#4076), never a line in the row.
// Owner rule: no toast covers a button. Held at 768 and up; at 360x500 only the Hear it button is held clear (see the assertion): known gap, #4076.
import { expect, test } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';
import { coveredByToast } from './helpers/toastCover';

const SIZES = [
  { width: 360, height: 500 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
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
    // The button the narrator pressed and the toast's own Retry are never covered, at any size. At 360x500 the Inspector's decision band is taller than
    // the window's share and is not pinned, so the shared Toast (its clearance is capped to keep 8rem of the window, #2899) lies over buttons of the
    // scrolling column there, as it does for any Proof toast; the other sizes are clear of every button.
    expect(
      result.covered.filter((name) => /^(Stop hearing it|Hear it)/.test(name)),
      `toast ${JSON.stringify(result.toast)} covers the Hear it button`,
    ).toEqual([]);
    if (size.width >= 768) expect(result.covered, `toast ${JSON.stringify(result.toast)} covers ${JSON.stringify(result.covered)}`).toEqual([]);
  });
}
