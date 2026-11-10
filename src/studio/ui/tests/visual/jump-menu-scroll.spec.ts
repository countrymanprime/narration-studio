// Arrowing down a long jump menu list keeps the search field in view (found by qa-breaker on #3248): the dialog scrolls, so the field is pinned.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

for (const [width, height] of [
  [1280, 800],
  [320, 300],
] as const) {
  test(`the search field stays in view while arrowing a long list at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/booth?mockBooth=many-chapters');
    await settlePage(page);
    await page.keyboard.press('Control+k');
    const field = page.getByRole('combobox', { name: 'Jump menu' });
    await field.fill('chapter');
    await page.getByRole('option').first().waitFor();
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');
    const [fieldBox, dialogBox] = await Promise.all([field.boundingBox(), page.getByRole('dialog').boundingBox()]);
    expect(fieldBox!.y).toBeGreaterThanOrEqual(dialogBox!.y - 1);
    // The active row is not hidden under the pinned field.
    const active = await page.locator('[role=option][aria-selected=true]').boundingBox();
    expect(active!.y).toBeGreaterThanOrEqual(fieldBox!.y + fieldBox!.height - 1);
  });
}
