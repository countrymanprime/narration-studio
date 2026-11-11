// Typed text an editor holds until its own Save is asked about when the narrator leaves (#3400): the credits template in Settings, a Story Bible entry being
// edited, a note being written on a Proof finding, and a box that saves on blur when the exit is a key press with the cursor still in it.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { clickNav, goToPage, openSettings } from './drivers/shared';

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
  await expect(unsaved(page, 'Unsaved settings')).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
  await expect(picker(page)).toHaveCount(0);
});

test('Alt+Left and the nav over an unsaved credits template ask too, and Discard & continue leaves', async ({ page }) => {
  await creditsDraft(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(unsaved(page, 'Unsaved settings')).toBeVisible();
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Cancel' }).click();
  await clickNav(page, 'Script');
  await expect(unsaved(page, 'Unsaved settings')).toBeVisible();
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Script' })).toBeVisible();
});

test('Save & continue over an unsaved credits template saves it, and the template reads the new text when Settings is opened again', async ({ page }) => {
  await creditsDraft(page);
  await clickNav(page, 'Script');
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Script' })).toBeVisible();
  await openSettings(page, 'Project');
  await page.getByRole('button', { name: /^Edit credits/ }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
});

test('a Story Bible entry being edited asks Unsaved changes before the nav leaves', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('button', { name: 'Edit this entry' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('Typed but not saved.');
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toBeVisible();
  await expect(question).toContainText('Save or discard your changes to');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Typed but not saved.');
});

test('a note being written on a Proof finding asks Unsaved changes on Alt+Left', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page.getByRole('textbox', { name: 'Add a note' }).fill('Typed but not saved.');
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard the note you are writing before leaving?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed but not saved.');
});

test('Alt+Left with the cursor still in a Settings box that saves on blur keeps what was typed', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  const narrator = page.getByRole('textbox', { name: /Narrator name/ });
  await narrator.fill('Ada Reader');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await openSettings(page, 'Project');
  await expect(page.getByRole('textbox', { name: /Narrator name/ })).toHaveValue('Ada Reader');
});

// The modal dialogs are exempt from the registry (draftHolders.guard.test.ts) because the exits are off while one is open: a typed project name stays.
test('Alt+Left with the New project dialog open does not leave it, and the typed name stays', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await switchProject(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: /new project/i });
  await dialog.getByRole('textbox').first().fill('A Book Not Yet Made');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(dialog.getByRole('textbox').first()).toHaveValue('A Book Not Yet Made');
});
