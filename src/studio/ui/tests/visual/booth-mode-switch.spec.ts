// Alt+Space in the Booth (#3445): the main button switches to its other mode and starts it at once, by the same press as Record and Cold read. From
// Record it starts a cold read, from Cold read a take; nothing new while either runs or while a popup has the keyboard; a held chord starts once.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { pastStartGuard } from './helpers/startGuard';

const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
// A take shows REC; a cold read's main button also reads Stop, so Stop alone does not tell them apart.
const stop = (page: Page) => page.getByText('REC', { exact: true });
const coldRunning = (page: Page) => page.getByText('Mic on · cold read', { exact: true });

async function openBooth(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(record(page)).toBeEnabled();
}

async function chooseColdRead(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Record options' }).click();
  await page.getByRole('radio', { name: 'Cold read' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cold read' })).toBeVisible();
}

/** Enter and Space after the switch are Record's: focus must be on the page, not on a control that keeps them. */
const onThePage = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body || el.tagName === 'MAIN';
  });

test.describe('Alt+Space switches the main button and starts it', () => {
  test('from Record: the button turns to Cold read and a cold read starts; Space then stops it', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Alt+Space');
    await expect(coldRunning(page)).toBeVisible();
    await expect(stop(page)).toHaveCount(0);
    expect(await onThePage(page)).toBe(true);
    await page.keyboard.press('Space');
    await expect(coldRunning(page)).toHaveCount(0);
    // The mode stays Cold read after it stops: the main button says so.
    await expect(page.getByRole('button', { name: 'Cold read' })).toBeVisible();
  });

  test('from Cold read: the button turns to Record and a take starts; Space then stops it', async ({ page }) => {
    await openBooth(page);
    await chooseColdRead(page);
    await page.keyboard.press('Alt+Space');
    await expect(stop(page)).toBeVisible();
    await expect(coldRunning(page)).toHaveCount(0);
    expect(await onThePage(page)).toBe(true);
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(stop(page)).toHaveCount(0);
    await expect(record(page)).toBeVisible();
  });

  test('during a take it does nothing new: the take goes on and the mode stays Record', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Space');
    await expect(stop(page)).toBeVisible();
    await page.keyboard.press('Alt+Space');
    await page.waitForTimeout(500);
    await expect(stop(page)).toBeVisible();
    await expect(coldRunning(page)).toHaveCount(0);
  });

  test('during a cold read it does nothing new: the cold read goes on and no take starts', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Alt+Space');
    await expect(coldRunning(page)).toBeVisible();
    await page.keyboard.press('Alt+Space');
    await page.waitForTimeout(500);
    await expect(coldRunning(page)).toBeVisible();
    await expect(stop(page)).toHaveCount(0);
  });

  test('with Record options focused it starts the take and frees focus, so Enter then stops it', async ({ page }) => {
    await openBooth(page);
    await chooseColdRead(page);
    await expect(page.getByRole('button', { name: 'Record options' })).toBeFocused();
    await page.keyboard.press('Alt+Space');
    await expect(stop(page)).toBeVisible();
    expect(await onThePage(page)).toBe(true);
    await pastStartGuard(page);
    await page.keyboard.press('Enter');
    await expect(stop(page)).toHaveCount(0);
  });

  test('a held chord starts once', async ({ page }) => {
    await openBooth(page);
    await chooseColdRead(page);
    await page.keyboard.down('Alt');
    await page.keyboard.down('Space');
    for (let i = 0; i < 10; i++) await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await page.keyboard.up('Alt');
    await expect(stop(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(stop(page)).toBeVisible();
  });

  test('with a popover open it does nothing: the popover keeps the keyboard and nothing starts', async ({ page }) => {
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await expect(page.getByRole('dialog', { name: 'Record options' })).toBeVisible();
    await page.keyboard.press('Alt+Space');
    await page.waitForTimeout(500);
    await expect(stop(page)).toHaveCount(0);
    await expect(coldRunning(page)).toHaveCount(0);
  });

  test('the keydown is handled, so the window menu Alt+Space opens on Windows is not asked for', async ({ page }) => {
    await openBooth(page);
    const prevented = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', altKey: true, bubbles: true, cancelable: true });
      document.querySelector('main')?.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});
