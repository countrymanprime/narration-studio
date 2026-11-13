import { expect, test } from '@playwright/test';

// #3416 item 41: at 320x300 the Check recordings footer sat below the dialog (Cancel and "Check N chapters" at y 219-255 in a dialog ending at y 207), clipped by
// it, so a real click did nothing and a focus ring was never seen. The body now scrolls as one area in a short window, so the footer is reached by scrolling
// (or by Tab, which scrolls it in) and a real mouse press on it starts the check.
test('Check recordings at 320x300: the footer buttons come inside the dialog when reached, and a real click starts the check', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto('/');
  await page
    .getByRole('button', { name: /Check recordings/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Check recordings' });
  await dialog.waitFor({ timeout: 20_000 });
  // The chapters to tick sit in a list; at 320x300 it was squeezed to 0 px, so no row could be seen or pressed however it was scrolled.
  const firstChapter = dialog.getByRole('checkbox').first();
  await firstChapter.scrollIntoViewIfNeeded();
  const pressable = await firstChapter.evaluate((box) => {
    const rect = box.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top !== null && (top === box || box.contains(top) || (top as HTMLElement).closest('label') === box.closest('label'));
  });
  expect(pressable, 'the first chapter can be seen and pressed').toBe(true);
  const run = dialog.getByRole('button', { name: /^Check \d+ chapters?$/ });
  await run.focus();
  const inside = await page.evaluate(() => {
    const popup = document.querySelector('[role=dialog]') as HTMLElement;
    const box = popup.getBoundingClientRect();
    return [...popup.querySelectorAll('button')]
      .filter((button) => /^(Cancel|Check \d+ chapters?)$/.test(button.textContent?.trim() ?? ''))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top >= box.top && rect.bottom <= box.bottom;
      });
  });
  expect(inside.length).toBe(2);
  expect(inside, 'Cancel and the run button are inside the dialog once the footer is reached').toEqual([true, true]);
  const target = await run.boundingBox();
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);
  await expect(dialog.getByRole('button', { name: /Stop checking/ })).toBeVisible({ timeout: 10_000 });
});
