import { expect, test } from '@playwright/test';

// #3416 item 40 (qa-breaker on #3460): Ctrl+K, Escape, Ctrl+K, Escape in quick succession ended with focus on <main>, not on the header's "Jump to or run" button
// the narrator started from: the second jump menu opened before the first had handed focus back, found focus on nothing and took the page for its opener.
test('Jump menu opened again straight after it closed still returns focus to the control it was opened from', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
  await opener.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const onOpener = () => opener.evaluate((element) => element === document.activeElement);
  // Three rounds: one with a pause between the close and the reopen, then two with none.
  for (const gap of [800, 0, 0]) {
    await opener.focus();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    if (gap) await page.waitForTimeout(gap);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    expect(await onOpener(), `focus is back on the opener after a reopen with a ${gap} ms gap`).toBe(true);
  }
});
