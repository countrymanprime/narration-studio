// A narrator on the keyboard and a screen reader. A dialog opened from the script text must give focus back to the script text, with the
// selection as it was, however it closes; and moving the cursor by key must be spoken through the overlay's polite announcer, once, where the
// cursor settles, even while an arrow key repeats.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const SCRIPT = '[data-script]';
const WORDS = `${SCRIPT} [data-kind="w"][data-k]`;

async function openEditing(page: Page): Promise<void> {
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  await page.locator(WORDS).first().waitFor();
}
const inScript = (page: Page) => page.evaluate((s) => document.activeElement === document.querySelector(s), SCRIPT);
const selected = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-sel]').length);
const announcer = (page: Page) => page.locator('[data-overlay-announcer]');

async function viaMenu(page: Page, item: string | RegExp): Promise<void> {
  await page.locator(WORDS).nth(3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: item }).click();
  await page.getByRole('dialog').waitFor();
}

const CLOSERS: { dialog: string | RegExp; item: string | RegExp; close: (page: Page) => Promise<void>; how: string }[] = [
  { dialog: 'Add a note', item: 'Add note…', how: 'Escape', close: (p) => p.keyboard.press('Escape') },
  { dialog: 'Add a note', item: 'Add note…', how: 'Cancel', close: (p) => p.getByRole('button', { name: 'Cancel' }).click() },
  {
    dialog: 'Add a note',
    item: 'Add note…',
    how: 'Save note',
    close: async (p) => {
      await p.getByRole('textbox', { name: 'Note' }).fill('Check the stress.');
      await p.getByRole('button', { name: 'Save note' }).click();
    },
  },
  { dialog: 'Voice sample', item: /Mark as voice sample/, how: 'Escape', close: (p) => p.keyboard.press('Escape') },
];

test.describe('Editing: focus returns to the script text', () => {
  for (const c of CLOSERS) {
    test(`${c.dialog} closed by ${c.how}`, async ({ page }) => {
      await openEditing(page);
      await viaMenu(page, c.item);
      await expect(page.getByRole('dialog', { name: c.dialog })).toBeVisible();
      await c.close(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => inScript(page)).toBe(true);
      expect(await selected(page)).toBeGreaterThan(0);
    });
  }

  test('a dialog opened by key still returns to the script text', async ({ page }) => {
    await openEditing(page);
    await page.locator(WORDS).nth(3).click();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Add note…' }).click();
    await page.getByRole('dialog', { name: 'Add a note' }).waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => inScript(page)).toBe(true);
  });
});

test.describe('Editing: the cursor is announced', () => {
  test('a word step, a phrase step and a selection are spoken once they settle', async ({ page }) => {
    await openEditing(page);
    await page.locator(WORDS).nth(3).click();
    await page.keyboard.press('ArrowRight');
    const next = await page.locator(WORDS).nth(4).textContent();
    await expect(announcer(page)).toHaveText(next!.trim());
    await page.keyboard.press('Control+ArrowRight');
    await expect(announcer(page)).not.toHaveText(next!.trim());
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(announcer(page)).toHaveText(/^3 words selected/);
    await page.keyboard.press('Escape');
    await expect(announcer(page)).toHaveText('Selection cleared');
  });

  test('a held arrow key speaks where it stopped, not each word it passed', async ({ page }) => {
    await openEditing(page);
    await page.locator(WORDS).nth(0).click();
    await page.evaluate(() => {
      const w = window as unknown as { __said: string[] };
      w.__said = [];
      new MutationObserver(() => w.__said.push(document.querySelector('[data-overlay-announcer]')?.textContent ?? '')).observe(
        document.querySelector('[data-overlay-announcer]')!,
        { childList: true, characterData: true, subtree: true },
      );
    });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(30);
    }
    const last = (await page.locator(WORDS).nth(12).textContent())!.trim();
    await expect(announcer(page)).toHaveText(last);
    const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said.filter(Boolean));
    expect(said).toEqual([last]);
  });
});
