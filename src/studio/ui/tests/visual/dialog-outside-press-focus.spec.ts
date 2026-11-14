import { expect, test } from '@playwright/test';

// #3416 item 39 (qa-breaker on #3460): a press outside a dialog that ignores outside presses left it open and moved keyboard focus to <body>, so the next Tab
// started from the page behind it (on the Booth's Stop recording? it reached "Stop and leave", the destructive button). Focus now stays where it was.
test('Check recordings (ignores outside presses): a press on the dim area keeps the dialog open and focus inside it', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await page
    .getByRole('button', { name: /Check recordings/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Check recordings' });
  await dialog.waitFor({ timeout: 20_000 });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await cancel.focus();
  await page.mouse.click(8, 8);
  await page.waitForTimeout(400);
  await expect(dialog).toBeVisible();
  const state = await page.evaluate(() => {
    const active = document.activeElement;
    return { inDialog: Boolean(active?.closest('[role=dialog]')), tag: active?.tagName };
  });
  expect(state.inDialog, `focus is on ${state.tag}, not inside the dialog`).toBe(true);
  // The next Tab stays in the dialog too, never the page behind it.
  await page.keyboard.press('Tab');
  const after = await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')));
  expect(after, 'Tab after the press stays inside the dialog').toBe(true);
});
