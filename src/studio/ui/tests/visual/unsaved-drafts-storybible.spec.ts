// Typed text on the Story Bible (an entry being edited, a new entry's name, a relationship row, a suggestion edit) is asked about when the narrator leaves, or
// goes on to something that replaces the editor (#3400). A draft that cannot be saved takes Save away, and nothing is saved while one is held.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { WIRE_ENTITIES } from '../../src/api/mockFixtures';
import { settlePage } from './helpers/settle';
import { clickNav, goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const unsaved = (page: Page, name: string) => page.getByRole('alertdialog', { name });

async function startEntryEdit(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('button', { name: 'Edit this entry' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('Typed but not saved.');
}

async function startRelationship(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add a relationship' }).click();
  const row = page.getByRole('combobox', { name: 'Relationship' }).last();
  await row.fill('friend of');
  await row.blur();
}

test('a Story Bible entry being edited asks Unsaved changes before the nav leaves; Cancel keeps the text', async ({ page }) => {
  await startEntryEdit(page);
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toBeVisible();
  await expect(question).toContainText('Save or discard your changes to');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Typed but not saved.');
});

test('Save & continue over an entry edit saves it, and the entry reads the new text when the Story Bible is opened again', async ({ page }) => {
  await startEntryEdit(page);
  await clickNav(page, 'Production');
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await goToPage(page, 'Story Bible');
  await expect(page.getByText('Typed but not saved.').first()).toBeVisible();
});

test('Add entry over an edited entry asks Unsaved changes', async ({ page }) => {
  await startEntryEdit(page);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard your changes to');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Typed but not saved.');
});

test('an approval note typed beside Approve asks before it is dropped: Keep editing or Discard & continue, no Save', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('button', { name: 'Edit this entry' }).click();
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('anchor take');
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('your approval note');
  await expect(question.getByRole('button', { name: 'Save & continue' })).toHaveCount(0);
  await question.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('anchor take');
});

test('a new entry that cannot be saved offers Keep editing and Discard & continue, with no Cancel and no word about saving', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('textbox', { name: 'Name' }).first().fill('Mr Fox');
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Discard the new entry “Mr Fox” before leaving?');
  await expect(question.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(question.getByRole('button', { name: 'Save & continue' })).toHaveCount(0);
  await expect(question.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await question.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('textbox', { name: 'Name' }).first()).toHaveValue('Mr Fox');
});

// D1, whole app: while a draft that cannot be saved is held, nothing is saved and nothing is dropped; only Discard & continue drops text. Saving the entry
// would close the editor and take the half-filled relationship row with it.
test('an entry edit beside a relationship that cannot be saved: no Save, Keep editing keeps both, Discard & continue leaves and saves nothing', async ({
  page,
}) => {
  await startEntryEdit(page);
  await startRelationship(page);
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Discard');
  await expect(question).toContainText('a relationship');
  await expect(question.getByRole('button', { name: 'Save & continue' })).toHaveCount(0);
  await question.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Typed but not saved.');
  await expect(page.getByRole('combobox', { name: 'Relationship' }).last()).toHaveValue('friend of');
  await clickNav(page, 'Production');
  await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await goToPage(page, 'Story Bible');
  await expect(page.getByText('Typed but not saved.')).toHaveCount(0);
});

// A box that saves when it loses focus (a relationship's words) reports its edit a moment after the focus leaves it: a click on a link at once, with the
// caret still in the box, asks all the same.
for (const width of [1440, 1100]) {
  test(`a nav link clicked with the caret still in a relationship row asks, at ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startEntryEdit(page);
    await page.getByRole('button', { name: 'Add a relationship' }).click();
    await page.getByRole('combobox', { name: 'Relationship' }).last().fill('rival of');
    await clickNav(page, 'Schedule');
    await expect(unsaved(page, 'Unsaved changes')).toContainText('a relationship');
    await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('combobox', { name: 'Relationship' }).last()).toHaveValue('rival of');
  });
}

test('a click one millisecond after the typing, with no blur between, still asks', async ({ page }) => {
  await startEntryEdit(page);
  await page.getByRole('button', { name: 'Add a relationship' }).click();
  await page.getByRole('combobox', { name: 'Relationship' }).last().fill('rival of');
  await page
    .locator('aside:visible')
    .first()
    .getByRole('button', { name: /^Schedule/ })
    .click({ delay: 1 });
  await expect(unsaved(page, 'Unsaved changes')).toBeVisible();
});

// The question with nothing to save opens on Keep editing at every width, also when a navigation drawer was open behind the link that asked.
for (const size of [
  { width: 1440, height: 900 },
  { width: 720, height: 600 },
  { width: 320, height: 300 },
]) {
  test(`Keep editing has the focus when the question opens from the navigation at ${size.width} wide`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Story Bible');
    await page.getByRole('button', { name: 'Add entry' }).click();
    await page.getByRole('textbox', { name: 'Name' }).first().fill('Mr Fox');
    await clickNav(page, 'Production');
    const question = unsaved(page, 'Unsaved changes');
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
  });
}

// The question at the smallest window shows its whole sentence and every button inside the window, however long a name or a list is.
const LONG_NAME = 'Bartholomew Fitzwilliam Montgomery-Smythe the Third';

/** Gives the first Story Bible entry a long saved name, as the host would send it. */
async function withLongEntryName(page: Page): Promise<void> {
  await page.addInitScript(
    ({ entities, name }) => {
      const first = entities[0]!;
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
        guideEntities: async () => entities.map((entity) => (entity.id === first.id ? { ...entity, canonical_name: name } : entity)),
      };
    },
    { entities: WIRE_ENTITIES, name: LONG_NAME },
  );
}

async function expectFits(page: Page, dialog: Locator): Promise<void> {
  const body = dialog
    .locator('p, [id]')
    .filter({ hasText: /\?$|\.$/ })
    .first();
  await expect(body).toBeVisible();
  const clipped = await body.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY !== 'visible') {
        const box = parent.getBoundingClientRect();
        return rect.bottom > box.bottom + 0.5 || rect.top < box.top - 0.5 ? `${rect.bottom} past ${box.bottom}` : '';
      }
    }
    return '';
  });
  expect(clipped, 'the sentence is cut off by the dialog').toBe('');
  const view = page.viewportSize()!;
  for (const button of await dialog.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.y + box.height, await button.innerText()).toBeLessThanOrEqual(view.height);
    expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(view.width);
  }
}

test.describe('at 320 x 300', () => {
  test.use({ viewport: { width: 320, height: 300 } });

  test('the question for an entry with a very long name shows its whole sentence', async ({ page }) => {
    await withLongEntryName(page);
    await startEntryEdit(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const dialog = unsaved(page, 'Unsaved changes');
    await expect(dialog).toContainText('Save or discard your changes to Bartholomew');
    await expectFits(page, dialog);
  });

  test('the question for a long name and a started relationship shows its whole sentence', async ({ page }) => {
    await withLongEntryName(page);
    await startEntryEdit(page);
    await startRelationship(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const dialog = unsaved(page, 'Unsaved changes');
    await expect(dialog).toContainText('Discard');
    await expectFits(page, dialog);
  });

  test('the question for a new entry with a very long name shows its whole sentence', async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Story Bible');
    await page.getByRole('button', { name: 'Add entry' }).click();
    await page.getByRole('textbox', { name: 'Name' }).first().fill(LONG_NAME);
    await page.keyboard.press('Alt+ArrowLeft');
    const dialog = unsaved(page, 'Unsaved changes');
    await expect(dialog).toContainText('Discard the new entry');
    await expectFits(page, dialog);
  });
});
