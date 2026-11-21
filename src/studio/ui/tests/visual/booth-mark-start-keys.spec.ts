// After "Mark the start here" the next key is Record's (#3319): the closed menu hands focus to the page, not to the header's first button, so Enter records
// from the mark instead of opening the previous chapter. Mock app and fake recorder.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
import { rightClickVisibleWord } from './helpers/visibleWord';

test.use({ viewport: { width: 1440, height: 900 } });

for (const key of ['Enter', 'Space']) {
  test(`${key} after Mark the start here records from the mark and stays on the chapter`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(page.getByRole('button', { name: /^Record$/, includeHidden: true })).toBeEnabled();
    await rightClickVisibleWord(page);
    await page.getByRole('menuitem', { name: 'Mark the start here' }).click();
    await expect(page.locator('[data-booth-text] [data-start]')).toHaveCount(1);
    await page.waitForTimeout(700);
    // Focus is on the page, never a header control that Enter would press.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
    const chapter = new URL(page.url()).search;
    await page.keyboard.press(key);
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 6000 });
    expect(new URL(page.url()).search).toBe(chapter);
  });
}
