// A note being written on a Proof finding (or an edit of one) waits for its own Save; it is asked about when the narrator leaves, and when a move on the page
// would replace the note box: another note, another chapter, the step to the next note (#3400).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const unsaved = (page: Page, name: string) => page.getByRole('alertdialog', { name });

async function typeNote(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page.getByRole('textbox', { name: 'Add a note' }).fill('Typed but not saved.');
}

test('a note being written on a Proof finding asks Unsaved changes on Alt+Left, and Cancel keeps it', async ({ page }) => {
  await typeNote(page);
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard the note you are writing before leaving?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed but not saved.');
});

test('Discard & continue over a typed note leaves and drops it', async ({ page }) => {
  await typeNote(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await goToPage(page, 'Proof');
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('');
});

test('another finding over a typed Proof note asks Unsaved changes', async ({ page }) => {
  await typeNote(page);
  await page.getByRole('textbox', { name: 'Add a note' }).blur();
  await page.keyboard.press('ArrowDown');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard the note you are writing before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed but not saved.');
});

test('Save & continue over a typed note saves it and leaves', async ({ page }) => {
  await typeNote(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await goToPage(page, 'Proof');
  await expect(page.getByText('Typed but not saved.').first()).toBeVisible();
});

// Undo of a decision goes back to the note it was taken on, which replaces the Inspector: a note typed on the finding now open is asked about (D1).
async function decideThenType(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page
    .getByRole('button', { name: /^Fine as read/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  await page.getByRole('textbox', { name: 'Add a note' }).fill('Typed on the next finding.');
}

test('Undo of a decision over a note typed on another finding asks Unsaved changes, and Cancel keeps the note', async ({ page }) => {
  await decideThenType(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed on the next finding.');
});

test('Control+Z over a note typed on another finding asks too, with the box blurred', async ({ page }) => {
  await decideThenType(page);
  await page.getByRole('textbox', { name: 'Add a note' }).blur();
  await page.keyboard.press('Control+KeyZ');
  await expect(unsaved(page, 'Unsaved changes')).toBeVisible();
});

// The check card's "Open in Editing" link sits on the Proof page in chapter scope beside a note box.
test('Open in Editing from a check finding asks when a note is typed, and Cancel keeps it', async ({ page }) => {
  await page.goto('/?mockChapterLink=confirmed');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page.getByRole('button', { name: /^Chapter 1: Down the Rabbit-Hole/ }).click();
  await page.getByRole('button', { name: 'Show the findings' }).click();
  await page.getByRole('textbox', { name: 'Add a note' }).fill('Typed before the link.');
  await page.getByRole('link', { name: 'Open in Editing: Said twice' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed before the link.');
});
