// Typed text an editor holds until its own Save is asked about when the narrator leaves (#3400): the credits template in Settings, a Story Bible entry being
// edited, a note being written on a Proof finding, and a box that saves on blur when the exit is a key press with the cursor still in it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { WIRE_ENTITIES } from '../../src/api/mockFixtures';
import { settlePage } from './helpers/settle';
import { clickNav, goToPage, openSettings, selectReaderWord } from './drivers/shared';

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

// The question at the smallest window (320 x 300) shows its whole sentence and every button inside the window, however long a name or a list is (#3404).
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

  test('the question for a long name and a list of drafts shows its whole sentence', async ({ page }) => {
    await withLongEntryName(page);
    await startEntryEdit(page);
    await startRelationship(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const dialog = unsaved(page, 'Unsaved changes');
    await expect(dialog).toContainText('will be discarded');
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

  test('a credits template, two kinds of draft in the Settings pane, fits too', async ({ page }) => {
    await creditsDraft(page);
    await page.keyboard.press('Alt+ArrowLeft');
    await expectFits(page, unsaved(page, 'Unsaved settings'));
  });
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

test('an entry edit beside a relationship that was started still offers Save, and Save & continue leaves with the entry saved', async ({ page }) => {
  await startEntryEdit(page);
  await startRelationship(page);
  await clickNav(page, 'Production');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('A relationship will be discarded.');
  await question.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await goToPage(page, 'Story Bible');
  await expect(page.getByText('Typed but not saved.').first()).toBeVisible();
});

// A save that never answers must not trap the narrator: after its limit the buttons come back and the text is still there (#3404).
test('a save that never answers gives Cancel and Discard back after 15 seconds, and the text stays', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = { saveCreditsTemplate: () => new Promise(() => {}) };
  });
  await creditsDraft(page);
  await switchProject(page);
  const question = unsaved(page, 'Unsaved settings');
  await question.getByRole('button', { name: 'Save & continue' }).click();
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(question).toBeVisible();
  await page.clock.fastForward(16_000);
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await expect(page.getByText('Saving is taking too long. What you typed is still here.')).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
  await switchProject(page);
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(picker(page)).toBeVisible();
});

// Moves inside a page that would unmount or replace a draft ask too (#3404).
const RAIL = 'Words, Story Bible and marks';

/** Looks the word up in the Script page's text, which opens its card on the Words tab, and types how the narrator says it. */
async function typePronunciation(page: Page, word: string, say: string): Promise<Locator> {
  await selectReaderWord(page, word);
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up in the dictionary or the Story Bible' }).click();
  const rail = page.locator(`section[aria-label="${RAIL}"]`).first();
  const box = rail.getByLabel(`Pronunciation of ${word} for my dictionary`);
  await box.fill(say);
  return rail;
}

test('switching the Script rail tab over a typed pronunciation asks Unsaved changes', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
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

test('looking up another word in the Script text over a typed pronunciation asks Unsaved changes', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  const rail = await typePronunciation(page, 'tired', 'TY-erd');
  await selectReaderWord(page, 'sister');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up in the dictionary or the Story Bible' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(rail.getByLabel('Pronunciation of tired for my dictionary')).toHaveValue('TY-erd');
});

test('another finding over a typed Proof note asks Unsaved changes', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page.getByRole('textbox', { name: 'Add a note' }).fill('Typed but not saved.');
  await page.getByRole('textbox', { name: 'Add a note' }).blur();
  await page.keyboard.press('ArrowDown');
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard the note you are writing before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Typed but not saved.');
});

test('typing in Settings search over an unsaved template asks Unsaved settings, and the typing carries on after Cancel', async ({ page }) => {
  await creditsDraft(page);
  const search = page.getByLabel('Search settings');
  await search.click();
  await page.keyboard.type('voice');
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toContainText('before going on?');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue('Typed but not saved.');
  await expect(search).toHaveValue('');
});

test('Add entry over an edited entry asks Unsaved changes', async ({ page }) => {
  await startEntryEdit(page);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const question = unsaved(page, 'Unsaved changes');
  await expect(question).toContainText('Save or discard your changes to');
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Typed but not saved.');
});

// A box that saves when it loses focus (a relationship's words) reports its edit a moment after the focus leaves it: a click on a link at once, with the
// caret still in the box, asks all the same (#3404).
for (const width of [1440, 1100]) {
  test(`a nav link clicked with the caret still in a relationship row asks, at ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startEntryEdit(page);
    await page.getByRole('button', { name: 'Add a relationship' }).click();
    await page.getByRole('combobox', { name: 'Relationship' }).last().fill('rival of');
    await clickNav(page, 'Schedule');
    await expect(unsaved(page, 'Unsaved changes')).toContainText('A relationship will be discarded.');
    await unsaved(page, 'Unsaved changes').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('combobox', { name: 'Relationship' }).last()).toHaveValue('rival of');
  });
}

test('a click one millisecond after the typing, with no blur between, still asks', async ({ page }) => {
  await startEntryEdit(page);
  await page.getByRole('button', { name: 'Add a relationship' }).click();
  const box = page.getByRole('combobox', { name: 'Relationship' }).last();
  await box.fill('rival of');
  await page
    .locator('aside:visible')
    .first()
    .getByRole('button', { name: /^Schedule/ })
    .click({ delay: 1 });
  await expect(unsaved(page, 'Unsaved changes')).toBeVisible();
});

// The question with nothing to save opens on Keep editing at every width, also when a navigation drawer was open behind the link that asked (#3404).
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

// Changing or clearing the search while the results hold an editor asks as the first letter did (#3404).
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
