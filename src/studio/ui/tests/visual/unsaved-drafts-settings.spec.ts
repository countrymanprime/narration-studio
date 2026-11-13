// A Merriam-Webster key pasted into Settings and not saved is held text that is not one of Settings' saved fields; leaving, or swapping the pane under it, asks (#3400).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { openSettings } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });
const switchProject = (page: Page) => page.getByRole('button', { name: /, switch project$/ }).click();
const unsaved = (page: Page) => page.getByRole('alertdialog', { name: 'Unsaved settings' });

async function pasteKey(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Voice & pronunciation');
  await page.getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
}

test('Switch project over a pasted key asks, names the key, and Cancel keeps it', async ({ page }) => {
  await pasteKey(page);
  await switchProject(page);
  await expect(unsaved(page)).toContainText('Save or discard the key you pasted before leaving?');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  await expect(picker(page)).toHaveCount(0);
});

test('Alt+Left over a pasted key asks, and Discard & continue leaves', async ({ page }) => {
  await pasteKey(page);
  await page.getByRole('heading', { level: 2 }).first().click();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
});

test('another category and the Settings search ask over a pasted key, and the typing carries on after Cancel', async ({ page }) => {
  await pasteKey(page);
  await page
    .getByRole('navigation', { name: 'Settings categories' })
    .getByRole('button', { name: /^Appearance/ })
    .click();
  await expect(unsaved(page)).toContainText('before going on?');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  await page.getByRole('textbox', { name: 'Search settings' }).fill('k');
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
});

test.describe('at 320 x 300', () => {
  test.use({ viewport: { width: 320, height: 300 } });
  test('the question over a pasted key shows its whole sentence', async ({ page }) => {
    await pasteKey(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const question = unsaved(page);
    await expect(question).toBeVisible();
    const box = await question.boundingBox();
    expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 300).toBe(true);
    await expect(question).toContainText('before leaving?');
  });
});
