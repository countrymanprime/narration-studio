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

// #2961: a 10,000-character chapter name stays inside its row. No seed puts a name that long in the menu (`many-unbroken` stresses the Booth
// text), so the first row's label is given one here and the real layout is measured.
for (const [width, height] of [
  [1280, 800],
  [320, 300],
] as const) {
  for (const [kind, name] of [
    ['unbroken', 'x'.repeat(10_000)],
    ['spaced', 'word '.repeat(2_000)],
  ] as const) {
    test(`a 10,000-character ${kind} name stays inside its row at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/booth?mockBooth=many-chapters');
      await settlePage(page);
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox', { name: 'Jump menu' }).fill('chapter');
      await page.getByRole('option').first().waitFor();
      await page.evaluate((text) => {
        document.querySelector('[role=option] span.truncate')!.textContent = text;
      }, name);
      const dialog = (await page.getByRole('dialog').boundingBox())!;
      const row = (await page.getByRole('option').first().boundingBox())!;
      expect(row.x + row.width).toBeLessThanOrEqual(dialog.x + dialog.width + 1);
      expect(row.height).toBeLessThan(120);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
