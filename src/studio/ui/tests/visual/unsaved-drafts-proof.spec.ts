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
