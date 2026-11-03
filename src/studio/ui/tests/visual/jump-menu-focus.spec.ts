// After a result is chosen in the jump menu (#2902), focus lands where the narrator went, never on the header's project button.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    return `${el.tagName}|${el.getAttribute('aria-label') ?? el.id ?? ''}|${el.closest('main') ? 'in-main' : 'outside-main'}`;
  });

test.describe('The jump menu hands focus to the destination', () => {
  for (const [name, path, term] of [
    ['Script', '/script', 'chapter'],
    ['Production', '/production', 'chapter'],
  ] as const) {
    test(`choosing a result from ${name} does not leave focus on the header`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await settlePage(page);
      await page.keyboard.press('Control+k');
      const field = page.getByRole('combobox', { name: 'Jump menu' });
      await field.waitFor();
      await field.fill(term);
      await page.getByRole('option').first().waitFor();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.waitForTimeout(300);
      const where = await focusedName(page);
      expect(where).toContain('in-main');
      expect(where).not.toContain('switch project');
    });
  }

  test("choosing a chapter on Script puts focus on that chapter's heading", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/script');
    await settlePage(page);
    await page.keyboard.press('Control+k');
    const field = page.getByRole('combobox', { name: 'Jump menu' });
    await field.waitFor();
    await field.fill('chapter');
    await page.getByRole('option').first().waitFor();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(300);
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { tag: el?.tagName, inBound: !!el?.closest('[data-bound]'), text: el?.textContent ?? '' };
    });
    expect(where.tag).toBe('H2');
    expect(where.inBound).toBe(true);
    expect(where.text.trim().length).toBeGreaterThan(0);
  });
});
