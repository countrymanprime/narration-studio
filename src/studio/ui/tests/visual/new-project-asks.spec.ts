// A name typed in the New Project dialog is a draft: Escape and the close button ask "Discard the project name?" first (Keep editing focused), the footer button
// reads Close when empty and Discard name once a name is typed and drops it without asking, a press on the backdrop does nothing, and a held Enter that answered the question
// does not create the project in the box it returns to (#3531, #3400).
import { expect, test, type Page } from '@playwright/test';
import { expectFits } from './helpers/questionFits';
import { enterHoldOver } from './helpers/enterHold';
import { settlePage } from './helpers/settle';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'New Project' });
const question = (page: Page) => page.getByRole('alertdialog', { name: 'Discard the project name?' });

async function openWithName(page: Page, name = 'The Lighthouse Keeper'): Promise<void> {
  await page.goto('/?mockNoProject=1');
  await settlePage(page);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await expect(dialog(page)).toBeVisible();
  if (name) await dialog(page).getByRole('textbox', { name: 'Name' }).fill(name);
}

test('with nothing typed, Escape closes at once and the footer button reads Close', async ({ page }) => {
  await openWithName(page, '');
  await expect(dialog(page).getByRole('button', { name: 'Close' }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(question(page)).toHaveCount(0);
});

test('Escape over a typed name asks with Keep editing focused; Keep editing keeps the name, Discard closes', async ({ page }) => {
  await openWithName(page);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await expect(question(page).getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await question(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toHaveValue('The Lighthouse Keeper');
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: 'Discard' }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test('the close button asks too, and the footer Discard name drops it without asking', async ({ page }) => {
  await openWithName(page);
  await dialog(page).getByRole('button', { name: 'Close' }).first().click();
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: 'Keep editing' }).click();
  await dialog(page).getByRole('button', { name: 'Discard name' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(question(page)).toHaveCount(0);
});

test('a press on the backdrop does nothing to the dialog or the name', async ({ page }) => {
  await openWithName(page);
  await page.mouse.click(5, 5);
  await expect(question(page)).toHaveCount(0);
  await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toHaveValue('The Lighthouse Keeper');
});

test('a held Enter that answered the question does not create the project in the box it returns to', async ({ page }) => {
  await openWithName(page);
  await page.keyboard.press('Escape');
  await enterHoldOver(question(page));
  await page.waitForTimeout(500);
  await page.keyboard.down('Enter');
  for (let n = 0; n < 6; n++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(question(page)).toHaveCount(0);
  await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toHaveValue('The Lighthouse Keeper');
  await expect(dialog(page)).toBeVisible();
});

test.describe('at 320 x 300', () => {
  test.use({ viewport: { width: 320, height: 300 } });
  test('the question shows its whole sentence with room to spare and its labels on one line', async ({ page }) => {
    await openWithName(page);
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeVisible();
    await expectFits(page, question(page), 8);
  });
});
