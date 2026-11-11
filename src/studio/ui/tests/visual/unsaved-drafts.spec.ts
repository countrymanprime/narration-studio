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

// The exit is decided after the box that was focused has reported its edit: a focused invalid number box, Alt+Left, ten times over.
test('Alt+Left from a focused invalid number box asks every time', async ({ page }) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.goto('/');
    await settlePage(page);
    await openSettings(page, 'Set on a page');
    const entry = page.locator('[data-page-setting="ps.coverage"]');
    await entry.getByRole('button', { name: 'Change it here for now' }).click();
    const box = entry.getByLabel('Share of each paragraph that must be read', { exact: false }).first();
    await box.fill('abc');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByRole('alertdialog', { name: 'Unsaved settings' }), `attempt ${attempt + 1}`).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('abc');
  }
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

test('a browser Back with a dialog open and nothing held leaves the dialog and the page where they were', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('> Show keyboard shortcuts');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.location.pathname)).toBe('/script');
});

test('the Unsaved changes question shows its whole sentence at 320 x 300 even for five replies', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('button', { name: 'Edit this entry' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('Typed but not saved.');
  await page.keyboard.press('Alt+ArrowLeft');
  const dialog = unsaved(page, 'Unsaved changes');
  await expect(dialog).toBeVisible();
  const sentence = dialog.getByText(/^Save or discard .* before leaving\?$/);
  await expect(sentence).toBeVisible();
  const clipped = await sentence.evaluate((node) => {
    const holder = node.closest('[id]') ?? node.parentElement!;
    return node.scrollHeight > node.clientHeight + 1 || (holder as HTMLElement).scrollHeight > (holder as HTMLElement).clientHeight + 1;
  });
  expect(clipped).toBe(false);
});
