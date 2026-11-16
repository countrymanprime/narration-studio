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

// qa-breaker on the first version of the fix: the remembered opener is for the SAME dialog opened again. A different dialog opened by a page-wide key right after
// the jump menu closed (here the "?" shortcut sheet) must not return to the jump button.
//
// The test puts focus on nothing (a narrator who clicked off) before the page key. It waits for the jump menu to have handed focus back first: the menu hands
// it back a tick after its exit animation, and on a slow machine (#3498) that came after the blur, so focus was on the jump button when "?" was pressed and
// the sheet rightly returned there. Waiting on that state, not on a time, makes the blur happen after the hand-back at any speed; the same test also runs
// with the CPU throttled, which is how the race showed. The throttled run guards against a time-based wait creeping back; it does not guard the intent
// itself (under the throttle the sheet opens after the jump menu's 600 ms `recentOpener` window, so the borrow it protects against cannot happen): the normal-speed
// run does, and fails if the title check in `Dialog.tsx`'s `openerAtMount` is removed.
for (const throttle of [1, 20]) {
  test(`A different dialog opened by a page key right after the jump menu closed does not return to the jump button, with the CPU ${throttle}x slower`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    if (throttle > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
    await opener.waitFor({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    await opener.focus();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
    // Escape goes to the dialog as soon as focus is inside it, with the opener's hint still on screen (#3500).
    await expect(page.getByRole('dialog').locator(':focus')).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press('Escape');
    // The jump menu has closed and handed focus back to the control it was opened from: only now is there something to take focus away from.
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
    await expect(opener).toBeFocused({ timeout: 20_000 });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog').locator(':focus')).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press('Escape');
    // The sheet's hand-back is a tick after it closes: settle on the page the sheet returned to, then look.
    await expect(page.locator('main')).toBeFocused({ timeout: 20_000 });
    expect(await opener.evaluate((element) => element === document.activeElement), 'focus did not return to the jump button').toBe(false);
  });
}
