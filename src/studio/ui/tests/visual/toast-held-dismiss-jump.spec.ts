import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

// #4103 (qa-breaker on #4120): a Dismiss pressed from the keyboard hands focus back to the control that had it before the toast. Held down, the key's own coming up decides when, and only
// if nothing else took focus meanwhile: hold Enter on Dismiss, open the Jump menu (a click, or Ctrl+K), release the key: the Jump menu's field keeps focus, it does not jump to the
// button behind the open modal and take the narrator's typing with it.
type Raise = { __raiseToast: (text: string) => void };

async function raiseAndFocusDismiss(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await page.waitForFunction(() => typeof (window as unknown as Partial<Raise>).__raiseToast === 'function');
  await page.evaluate(() => (window as unknown as Raise).__raiseToast('The save failed. Try again.'));
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
}

const jumpField = (page: Page) => page.getByRole('combobox', { name: 'Jump menu' });

test('hold Enter on Dismiss, open the Jump menu with a click, release Enter: the field keeps focus', async ({ page }) => {
  await raiseAndFocusDismiss(page);
  await page.keyboard.down('Enter');
  await page
    .getByRole('button', { name: /Jump to or run/ })
    .first()
    .click();
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('Enter');
  await page.waitForTimeout(600);
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.type('script');
  await expect(jumpField(page)).toHaveValue('script');
});

test('hold Enter on Dismiss, Ctrl+K, release K then Enter: the field keeps focus the whole time', async ({ page }) => {
  await raiseAndFocusDismiss(page);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Control');
  await page.keyboard.down('KeyK');
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('KeyK');
  await page.keyboard.up('Control');
  await page.waitForTimeout(600);
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('Enter');
  await page.waitForTimeout(600);
  await expect(jumpField(page)).toBeFocused();
});

test('Dismiss pressed and released with nothing else touched hands focus back to where it was', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await page.waitForFunction(() => typeof (window as unknown as Partial<Raise>).__raiseToast === 'function');
  const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
  await opener.focus();
  await page.evaluate(() => (window as unknown as Raise).__raiseToast('The save failed. Try again.'));
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  // Tab from the opener goes through the page to the toast; focus it directly the way a narrator's Tab would end up there.
  await dismiss.focus();
  await page.keyboard.press('Enter');
  await expect(dismiss).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator(':focus')).not.toHaveJSProperty('tagName', 'BODY');
});
