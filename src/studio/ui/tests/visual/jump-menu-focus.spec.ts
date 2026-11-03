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

  // #2902: the heading takes focus whatever had it when the menu opened. The dialog used to hand focus back to its opener after the reader
  // moved it, so only a jump from a cold page (nothing focused) worked.
  const jumpTo = async (page: Page, term: string) => {
    await page.keyboard.press('Control+k');
    const field = page.getByRole('combobox', { name: 'Jump menu' });
    await field.waitFor();
    await field.fill(term);
    await page.getByRole('option').first().waitFor();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(300);
  };
  const focusedHeading = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === 'H2' && el.closest('[data-bound]') ? (el.textContent ?? '').trim() : `not a heading: ${el?.tagName}`;
    });

  for (const [from, prepare] of [
    ['a first jump', async () => {}],
    [
      'the reader clicked',
      async (page: Page) =>
        void (await page
          .locator('[data-script]')
          .first()
          .click({ position: { x: 5, y: 5 } })),
    ],
    ['the header project button focused', async (page: Page) => void (await page.getByRole('button', { name: /switch project/i }).focus())],
  ] as const) {
    test(`a second jump lands on the new chapter's heading, from ${from}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/script');
      await settlePage(page);
      await jumpTo(page, 'chapter 3');
      expect(await focusedHeading(page)).toMatch(/Chapter 3/);
      await prepare(page);
      await jumpTo(page, 'chapter 7');
      expect(await focusedHeading(page)).toMatch(/Chapter 7/);
    });
  }
});
