// The credits template editor in Settings holds typed text until Save template (the project values below it save as they are typed). Leaving Settings, or
// a move on the page that would replace the editor (Close, another template, New, Duplicate, another category, a change of the search), asks (#3400).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { openSettings } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });
const switchProject = (page: Page) => page.getByRole('button', { name: /, switch project$/ }).click();
const unsaved = (page: Page, name: string) => page.getByRole('alertdialog', { name });

async function creditsDraft(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  await page.getByRole('button', { name: /^Edit credits/ }).click();
  const body = page.getByRole('textbox', { name: 'Body' });
  await expect(body).not.toHaveValue('');
  await body.fill('Typed but not saved.');
}

test('Switch project over an unsaved credits template asks; Cancel keeps the editor and the text', async ({ page }) => {
  await creditsDraft(page);
  await switchProject(page);
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toContainText('Save or discard your credit template edit before leaving?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
  await expect(picker(page)).toHaveCount(0);
});

test('Alt+Left over an unsaved credits template asks too, and Discard & continue leaves', async ({ page }) => {
  await creditsDraft(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(unsaved(page, 'Unsaved settings')).toBeVisible();
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
});

test('Save & continue over an unsaved credits template saves it and opens the picker', async ({ page }) => {
  await creditsDraft(page);
  await switchProject(page);
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Save & continue' }).click();
  await expect(picker(page)).toBeVisible();
});

test('a change inside Settings asks too: another category over an unsaved credits template', async ({ page }) => {
  await creditsDraft(page);
  await page
    .getByRole('navigation', { name: 'Settings categories' })
    .getByRole('button', { name: /^Appearance/ })
    .click();
  await expect(unsaved(page, 'Unsaved settings')).toContainText('before going on?');
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
});

// Changing or clearing the search while the results hold an editor asks as the first letter did.
test('changing or clearing the Settings search over a credits template opened from the results asks', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  const search = page.getByLabel('Search settings');
  await search.fill('credits');
  await page.getByRole('button', { name: /^Edit credits/ }).click();
  await page.getByRole('textbox', { name: 'Body' }).fill('Typed but not saved.');
  for (const next of ['theme', '']) {
    await search.fill(next);
    const question = unsaved(page, 'Unsaved settings');
    await expect(question).toContainText('Save or discard your credit template edit before going on?');
    await question.getByRole('button', { name: 'Cancel' }).click();
    await expect(search).toHaveValue('credits');
    await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
  }
});

async function expectFits(page: Page, dialog: Locator): Promise<void> {
  const box = (await dialog.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  for (const button of await dialog.getByRole('button').all()) {
    const b = (await button.boundingBox())!;
    expect(b.y + b.height, await button.innerText()).toBeLessThanOrEqual(view.height);
    expect(b.x + b.width, await button.innerText()).toBeLessThanOrEqual(view.width);
  }
}

test.describe('at 320 x 300', () => {
  test.use({ viewport: { width: 320, height: 300 } });
  test('a credits template, a draft in the Settings pane, shows its whole question', async ({ page }) => {
    await creditsDraft(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const dialog = unsaved(page, 'Unsaved settings');
    await expect(dialog).toContainText('before leaving?');
    await expectFits(page, dialog);
  });
});
