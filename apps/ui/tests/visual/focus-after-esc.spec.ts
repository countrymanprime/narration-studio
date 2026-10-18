// Focus after Escape. Whatever a narrator opens from a control (a chip that expands in place, a header toggle, the drawer, the jump menu) must,
// when Escape closes it, hand focus back to the control that opened it - never to <body> or to the page's first button.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const WORDS = '[data-script] [data-kind="w"][data-k]';
const CHIP = '[data-tchip]';

/** `TAG#id` of the focused element, or its accessible name when it has no id: what a failure should print. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY';
    return `${el.tagName}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-tchip') ? '[data-tchip]' : ''}`;
  });

async function openEditing(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  await page.locator(WORDS).first().waitFor();
}

test.describe('Editing: Escape keeps focus where the narrator opened something', () => {
  test('the Takes chip collapses and keeps focus', async ({ page }) => {
    await openEditing(page);
    const chip = page.locator(CHIP).first();
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(await focused(page)).toBe('BUTTON[data-tchip]');
  });

  test('Escape from inside the opened takes collapses them and focuses the chip', async ({ page }) => {
    await openEditing(page);
    const chip = page.locator(CHIP).first();
    await chip.focus();
    await page.keyboard.press('Enter');
    const group = page.locator(`#${await chip.getAttribute('aria-controls')}`);
    await group.locator('button').first().focus();
    // The first Escape closes the control's hint (a hint owns Escape while it shows); the next folds the takes.
    await page.keyboard.press('Escape');
    if ((await chip.getAttribute('aria-expanded')) === 'true') await page.keyboard.press('Escape');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(await focused(page)).toBe('BUTTON[data-tchip]');
  });

  test('the Timeline toggle keeps focus', async ({ page }) => {
    await openEditing(page);
    await page.locator('#striptoggle').focus();
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('BUTTON#striptoggle');
  });

  test('the drawer closes on Escape from inside it and focus returns to its toggle', async ({ page }) => {
    await openEditing(page);
    await page.locator('#drawertoggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drawer')).toHaveCount(1);
    await page.locator('#drawer').getByRole('tab').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#drawertoggle');
  });

  test('the drawer closes on Escape from its toggle, which keeps focus', async ({ page }) => {
    await openEditing(page);
    await page.locator('#drawertoggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drawer')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#drawertoggle');
  });

  test('Escape in the script text still lets the cursor go', async ({ page }) => {
    await openEditing(page);
    await page.locator(WORDS).nth(3).click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-sel]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('BODY');
  });
});

// The jump menu is the same top-bar layer on every page: it must give focus back to whatever had it, from any page.
const JUMP_FROM: { name: string; path: string; control: string }[] = [
  { name: 'Editing', path: '/editing/chapter-1', control: '#drawertoggle' },
  { name: 'Script', path: '/script', control: 'main button:visible' },
  { name: 'Settings', path: '/settings', control: 'main button:visible' },
];

test.describe('The jump menu returns focus on Escape', () => {
  for (const from of JUMP_FROM) {
    test(`from ${from.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(from.path);
      await settlePage(page);
      const control = page.locator(from.control).first();
      await control.waitFor();
      await control.focus();
      const before = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        el.setAttribute('data-was-focused', '');
        return el.tagName;
      });
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('[data-was-focused]')).toBeFocused();
      expect(before).not.toBe('BODY');
    });
  }

  test('after Escape on a header toggle, the menu returns to that toggle and not to the Back button', async ({ page }) => {
    await openEditing(page);
    await page.locator('#striptoggle').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#striptoggle');
  });

  test('with nothing focused, focus lands inside the page, not on <body>', async ({ page }) => {
    await openEditing(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement))).toBe(true);
  });
});
