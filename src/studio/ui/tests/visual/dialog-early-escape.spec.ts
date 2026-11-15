import { expect, test } from '@playwright/test';

// #3500: the control that opens a dialog by keyboard shows its hint while it has focus, and the hint lingers about 90 ms (its exit animation) after focus moves into the
// dialog. The dialog took that hint for the one Escape was meant for and ignored the key. A hint on something behind the dialog is not the dialog's to answer.
// Not through `settlePage`: it switches the motion off, and with it the lingering hint.
for (const [name, key] of [
  ['the jump menu', 'Control+k'],
  ['the shortcut sheet', 'Shift+?'],
] as const) {
  test(`Escape pressed as soon as ${name} has focus closes it with one press`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
    await opener.waitFor({ timeout: 40_000 });
    // The page settling: the hints are armed lazily, on the first focus.
    await page.waitForTimeout(1500);
    await opener.focus();
    await page.keyboard.press(key);
    await page.getByRole('dialog').locator(':focus').waitFor();
    // The opener's hint is still showing at this moment: the case that was ignored.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
  });
}
