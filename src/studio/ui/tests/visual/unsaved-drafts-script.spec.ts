// Text typed in the Script rail and not saved (a pronunciation under "Save to my dictionary", a reply to a note, an edit of a message) is asked about when the
// narrator leaves, or goes on to something that replaces the card it is typed in: another rail tab, another word, a lookup from the text (#3400).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage, selectReaderWord } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const unsaved = (page: Page, name: string) => page.getByRole('alertdialog', { name });
const RAIL = 'Words, Story Bible and marks';

/** Looks the word up in the Script page's text, which opens its card on the Words tab, and types how the narrator says it. */
async function typePronunciation(page: Page, word: string, say: string): Promise<Locator> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, word);
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up in the dictionary or the Story Bible' }).click();
  const rail = page.locator(`section[aria-label="${RAIL}"]`).first();
  await rail.getByLabel(`Pronunciation of ${word} for my dictionary`).fill(say);
  return rail;
}

test('Alt+Left over a typed pronunciation asks Unsaved changes, and Cancel keeps it', async ({ page }) => {
  const rail = await typePronunciation(page, 'tired', 'TY-erd');
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard your “tired” pronunciation before leaving?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(rail.getByLabel('Pronunciation of tired for my dictionary')).toHaveValue('TY-erd');
});

test('switching the Script rail tab over a typed pronunciation asks Unsaved changes', async ({ page }) => {
  const rail = await typePronunciation(page, 'tired', 'TY-erd');
  await rail.getByRole('tab', { name: 'Notes', exact: true }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard your “tired” pronunciation before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(rail.getByLabel('Pronunciation of tired for my dictionary')).toHaveValue('TY-erd');
  await rail.getByRole('tab', { name: 'Notes', exact: true }).click();
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(rail.getByRole('tab', { name: 'Notes', exact: true, selected: true })).toBeVisible();
});

// H5: the arrow keys move the focus along the rail tabs without selecting; Enter or Space selects, and a question that hands the focus back does not ask again.
test('the arrow keys move along the rail tabs without selecting, and Enter selects', async ({ page }) => {
  const rail = await typePronunciation(page, 'tired', 'TY-erd');
  const words = rail.getByRole('tab', { name: 'Words', exact: true });
  await words.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rail.getByRole('tab', { name: 'Story Bible', exact: true })).toBeFocused();
  await expect(unsaved(page, 'Unsaved changes')).toHaveCount(0);
  await expect(words).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(rail.getByRole('tab', { name: 'Notes', exact: true })).toBeFocused();
  await expect(unsaved(page, 'Unsaved changes')).toHaveCount(0);
  // key: a rail tab (H5), not the question
  await page.keyboard.press('Enter');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toHaveCount(0);
  await expect(rail.getByLabel('Pronunciation of tired for my dictionary')).toHaveValue('TY-erd');
});

test('looking up another word in the Script text over a typed pronunciation asks Unsaved changes', async ({ page }) => {
  const rail = await typePronunciation(page, 'tired', 'TY-erd');
  await selectReaderWord(page, 'sister');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up in the dictionary or the Story Bible' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(rail.getByLabel('Pronunciation of tired for my dictionary')).toHaveValue('TY-erd');
});

test('a reply typed under a note asks before the nav leaves, and Discard & continue leaves', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'Rabbit');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
  await page.getByRole('menuitem').first().click();
  const composer = page.getByRole('dialog');
  await composer.getByRole('textbox').first().fill('First message');
  await composer
    .getByRole('button', { name: /^(Add|Save|Mark)/ })
    .last()
    .click();
  const rail = page.locator(`section[aria-label="${RAIL}"]`).first();
  await rail.getByRole('tab', { name: 'Notes', exact: true }).click();
  const card = rail.getByRole('article').first();
  await card.getByRole('textbox', { name: /^(Add to this note|Reply or note)$/ }).fill('Typed reply keep me');
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('before leaving?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(card.getByRole('textbox', { name: /^(Add to this note|Reply or note)$/ })).toHaveValue('Typed reply keep me');
  await page.keyboard.press('Alt+ArrowLeft');
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await page.evaluate(() => window.location.pathname)).not.toBe('/script');
});

// Deleting a note takes the reply typed under it along (Undo brings the note back, not the text), so it asks first (#3400).
test('Delete the note with a reply typed under it asks; Keep it leaves both, and with nothing typed it deletes at once', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'Rabbit');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
  await page.getByRole('menuitem').first().click();
  const composer = page.getByRole('dialog');
  await composer.getByRole('textbox').first().fill('First message');
  await composer
    .getByRole('button', { name: /^(Add|Save|Mark)/ })
    .last()
    .click();
  const rail = page.locator(`section[aria-label="${RAIL}"]`).first();
  await rail.getByRole('tab', { name: 'Notes', exact: true }).click();
  const card = rail.getByRole('article').first();
  const reply = card.getByRole('textbox', { name: /^(Add to this note|Reply or note)$/ });
  await reply.fill('A reply not added yet');
  await card.getByRole('button', { name: 'Delete the note' }).click();
  const question = unsaved(page, 'Delete the note?');
  await expect(question).toContainText('goes with it');
  await question.getByRole('button', { name: 'Keep it' }).click();
  await expect(reply).toHaveValue('A reply not added yet');
  await reply.fill('');
  await card.getByRole('button', { name: 'Delete the note' }).click();
  await expect(rail.getByRole('article')).toHaveCount(0);
});

async function noteWithReply(page: Page, reply: string): Promise<{ rail: Locator; card: Locator }> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'Rabbit');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
  await page.getByRole('menuitem').first().click();
  const composer = page.getByRole('dialog');
  await composer.getByRole('textbox').first().fill('First message');
  await composer
    .getByRole('button', { name: /^(Add|Save|Mark)/ })
    .last()
    .click();
  const rail = page.locator(`section[aria-label="${RAIL}"]`).first();
  await rail.getByRole('tab', { name: 'Notes', exact: true }).click();
  const card = rail.getByRole('article').first();
  await card.getByRole('textbox', { name: /^(Add to this note|Reply or note)$/ }).fill(reply);
  return { rail, card };
}

// Changing a note's Type replaces the mark under the card; what is typed in the card stays (#3400, qa-breaker on #3458).
test('changing the Type of a note keeps the reply typed under it', async ({ page }) => {
  const { rail } = await noteWithReply(page, 'Typed reply keep me');
  const type = rail.getByRole('article').first().getByRole('combobox', { name: 'Type' });
  const other = await type.evaluate((select) => [...(select as HTMLSelectElement).options].find((option) => !option.selected)!.value);
  await type.selectOption(other);
  await expect(
    rail
      .getByRole('article')
      .first()
      .getByRole('textbox', { name: /^(Add to this note|Reply or note)$/ }),
  ).toHaveValue('Typed reply keep me');
});

// Escape and the close button on the Mark composer are ways out, so with a note typed they ask (the Cancel button is the narrator discarding).
test('Escape on the Mark composer with a note typed asks, and Keep editing leaves the dialog and the text', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'Rabbit');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
  await page.getByRole('menuitem').first().click();
  const composer = page.getByRole('dialog');
  await composer.getByRole('textbox').first().fill('composer text');
  await page.keyboard.press('Escape');
  const question = page.getByRole('alertdialog', { name: 'Discard your note?' });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Keep editing' }).click();
  await expect(composer.getByRole('textbox').first()).toHaveValue('composer text');
});
