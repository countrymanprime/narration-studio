// After a right-click menu item (Next phrase) the next key is Record's: the closed menu hands focus to the page, not to the header's first button, so
// Enter records from where the reading moved (#3858) instead of opening the previous chapter. Mock app and fake recorder.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
import { rightClickVisibleWord } from './helpers/visibleWord';

test.use({ viewport: { width: 1440, height: 900 } });

for (const key of ['Enter', 'Space']) {
  test(`${key} after a right-click menu item records from the moved reading and stays on the chapter`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(page.getByRole('button', { name: /^Record$/, includeHidden: true })).toBeEnabled();
    await rightClickVisibleWord(page);
    await page.getByRole('menuitem', { name: 'Next phrase' }).click();
    await page.waitForTimeout(700);
    // Focus is on the page, never a header control that Enter would press.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
    const chapter = new URL(page.url()).search;
    await page.keyboard.press(key);
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 6000 });
    expect(new URL(page.url()).search).toBe(chapter);
  });
}
