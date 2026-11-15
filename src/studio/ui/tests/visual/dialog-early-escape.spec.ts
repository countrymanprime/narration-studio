import { expect, test } from '@playwright/test';

// #3500: the control that opens a dialog by keyboard shows its hint while it has focus, and the hint stays in the page for about 90 ms (measured) after focus moves into the
// dialog. The dialog took that hint for the one Escape was meant for and ignored the key. A hint on something behind the dialog is not the dialog's to answer.
//
// The Escape is sent from inside the page, a task after focus first lands in the dialog, and the test records whether the opener's hint was in the page at that moment, so a
// fast or slow test driver cannot turn it into a test that never meets the lingering hint. Not through `settlePage`: it switches the motion off, and with it the hint.
for (const [name, key] of [
  ['the jump menu', 'Control+k'],
  ['the shortcut sheet', 'Shift+?'],
] as const) {
  test(`Escape sent as soon as ${name} has focus closes it, with the opener's hint still showing`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
    await opener.waitFor({ timeout: 40_000 });
    // The page settling after load, before the first focus.
    await page.waitForTimeout(1500);
    await opener.focus();
    await page.evaluate(() => {
      (window as unknown as { hintAtEscape?: boolean }).hintAtEscape = undefined;
      document.addEventListener(
        'focusin',
        (event) => {
          const target = event.target as HTMLElement;
          if (!target.closest('[role="dialog"]')) return;
          setTimeout(() => {
            (window as unknown as { hintAtEscape?: boolean }).hintAtEscape = document.querySelector('[data-hint-popup]') !== null;
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
          }, 0);
        },
        { capture: true, once: true },
      );
    });
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => (window as unknown as { hintAtEscape?: boolean }).hintAtEscape), "the opener's hint was showing when Escape came").toBe(
      true,
    );
  });
}

// The same early Escape with an info icon's note on the page behind the dialog, opened by resting the mouse on the icon. The note belongs to the icon, not to the dialog.
test("Escape sent as soon as the jump menu has focus closes it, with an info icon's note from the mouse still showing", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await page
    .getByRole('button', { name: /Jump to or run/ })
    .first()
    .waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1500);
  const info = page.getByRole('button', { name: 'About the Rec. column' }).first();
  await info.scrollIntoViewIfNeeded();
  const box = (await info.boundingBox())!;
  await page.mouse.move(box.x - 30, box.y - 30);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await expect(page.locator('[data-hint-popup]')).toHaveCount(1, { timeout: 5_000 });
  await page.evaluate(() => {
    (window as unknown as { hintAtEscape?: boolean }).hintAtEscape = undefined;
    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[role="dialog"]')) return;
        setTimeout(() => {
          (window as unknown as { hintAtEscape?: boolean }).hintAtEscape = document.querySelector('[data-hint-popup]') !== null;
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        }, 0);
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
  expect(await page.evaluate(() => (window as unknown as { hintAtEscape?: boolean }).hintAtEscape), "the icon's note was showing when Escape came").toBe(true);
});
