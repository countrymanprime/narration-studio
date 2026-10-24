// How to reach each `storybible` state in STATE_CATALOG (see app.drivers.ts).
import type { Page } from '@playwright/test';
import { WIRE_ENTITIES } from '../../../src/api/mockFixtures';
import { settlePage } from '../helpers/settle';
import { type Driver, askForThePreviewVoice, clickNav, clickVisible, confirmDialog, goToPage, saveMerriamWebsterKey } from './shared';

/** Ticks the Filter menu's choices named (a kind, "None yet", "Needs review"...) and closes the menu, so the list and the chips show. */
async function filterBy(page: Page, ...choices: string[]) {
  await page.getByRole('button', { name: /^Filter/ }).click();
  const menu = page.getByRole('menu');
  for (const choice of choices)
    await menu.getByRole(/^Needs|^None|^Has|^Any|^All entries/.test(choice) ? 'menuitemradio' : 'menuitemcheckbox', { name: new RegExp(`^${choice}`) }).click();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  // Escape gives focus back to the Filter button, whose hint would then show in the capture: take the focus and the pointer off it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  await page.getByRole('tooltip').waitFor({ state: 'hidden' });
}

export const storybibleDrivers: Record<string, Driver> = {
  // The entries never answer, so `goToPage` (which waits for the first entry) is not used.
  loading: async (page) => {
    await page.goto('/?mockHold=entities');
    await settlePage(page);
    await clickNav(page, 'Story Bible');
    await page.getByRole('group', { name: 'Loading the Story Bible entries' }).waitFor();
  },
  'review-filter': async (page) => {
    // The mock host flags nothing, so the entries it lists are sent with White Rabbit (the entry and its name "Rabbit") and Hatter flagged,
    // the way the host sends them; its suggestions leave two to verify on White Rabbit.
    const flagged = WIRE_ENTITIES.map((entity) => {
      if (entity.id === 'white-rabbit') return { ...entity, review_state: 'needs review', review: { entry: true, aliases: ['Rabbit'] } };
      if (entity.id === 'mad-hatter') return { ...entity, review_state: 'needs review', review: { entry: true, aliases: [] } };
      return entity;
    });
    await page.addInitScript((entities) => {
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = { guideEntities: async () => entities };
    }, flagged);
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Needs review');
    await entryRows(page).filter({ hasText: 'White Rabbit' }).click();
    await page.getByRole('button', { name: 'Mark Rabbit reviewed' }).waitFor();
  },
  'entry-saving': async (page) => {
    await page.goto('/?mockHoldEdits=1');
    await settlePage(page);
    await clickNav(page, 'Story Bible');
    await entryRows(page).first().click();
    const unlock = page.getByRole('button', { name: 'Unlock entry' });
    if (await unlock.count()) await unlock.click();
    await clickVisible(page, 'button', 'Edit this entry');
    await clickVisible(page, 'button', 'Save changes to this entry');
    await page.getByRole('button', { name: 'Save changes to this entry' }).and(page.locator('[aria-busy="true"]')).waitFor();
  },
  'invalid-payload': async (page) => {
    await page.goto('/?mockInvalidPayload=storybible');
    await settlePage(page);
    await clickNav(page, 'Story Bible');
    await page.getByText('The app received data it could not read.').waitFor();
  },
  'voice-download-confirm': async (page) => {
    await askForThePreviewVoice(page, '/');
    await page.getByRole('alertdialog', { name: 'Download local preview voice?' }).waitFor();
  },
  'voice-download-progress': async (page) => {
    await askForThePreviewVoice(page, '/?mockAssets=downloading');
    await page.getByRole('button', { name: 'Download voice' }).click();
    await page.getByRole('dialog', { name: 'Downloading preview voice' }).waitFor();
    await page.getByText(/44 of 109 MB/).waitFor();
  },
  'voice-download-failed': async (page) => {
    await askForThePreviewVoice(page, '/?mockAssets=download-fails');
    await page.getByRole('button', { name: 'Download voice' }).click();
    await page.getByRole('alert').filter({ hasText: 'did not match the approved one' }).waitFor();
  },
  'category-all': async (page) => {
    await goToPage(page, 'Story Bible');
    await page.getByRole('button', { name: 'Filter' }).waitFor();
  },
  'category-character': async (page) => {
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Character');
  },
  'category-place': async (page) => {
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Place');
  },
  'category-organization': async (page) => {
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Organization');
  },
  'search-narrowed': async (page) => {
    await goToPage(page, 'Story Bible');
    await page.getByRole('textbox', { name: 'Search entries' }).fill('mad hat');
    await entryRows(page).first().waitFor();
  },
  // Ctrl+F searches the page: its entries come back under "Entries", found by any of their names.
  'jump-entries': async (page) => {
    await goToPage(page, 'Story Bible');
    await page.keyboard.press('Control+f');
    const box = page.getByRole('combobox', { name: 'Jump menu' });
    await box.waitFor();
    await box.fill('mad');
    await page.getByRole('option', { name: /^Hatter/ }).waitFor();
  },
  'no-manuscript': async (page) => {
    await page.goto('/story-bible?mockNoManuscript=1');
    await settlePage(page);
    await page.getByRole('button', { name: 'Import manuscript' }).waitFor();
  },
  'entity-selected': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
  },
  'name-clash': async (page) => {
    await openForEditing(page, 'Alice');
    // "White Rabbit" is another entry's name, so adding it offers the merge instead of a second copy.
    const box = page.getByRole('textbox', { name: 'Add a name' });
    await box.fill('White Rabbit');
    await box.press('Enter');
    await page.getByRole('button', { name: 'Merge into this entry' }).waitFor();
  },
  'relationship-picker': async (page) => {
    await openForEditing(page, 'Alice');
    await page.getByRole('button', { name: /^To: / }).first().click();
    await page.getByRole('listbox', { name: 'Matching entries' }).waitFor();
  },
  'entry-needs-review': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).filter({ hasText: 'March Hare' }).click();
  },
  'entry-pronunciation-missing': async (page) => {
    await goToPage(page, 'Story Bible');
    // March Hare has no pronunciation in the fixture data.
    await entryRows(page).filter({ hasText: 'March Hare' }).click();
    await clickVisible(page, 'button', 'Edit this entry');
    await page.getByRole('textbox', { name: 'How I say March Hare' }).waitFor();
  },
  'entry-names-own-pronunciation': async (page) => {
    await openForEditing(page, 'Alice');
    const field = page.getByRole('textbox', { name: 'How I say Alice' });
    await field.fill('AL-iss');
    await field.press('Enter');
    await page.getByRole('button', { name: /^Pronunciation source for Alice: Entered by me/ }).waitFor();
  },
  'alias-pronunciation-editing': async (page) => {
    // White Rabbit has one alias, "Rabbit", with its own generated pronunciation in the fixture data.
    await openForEditing(page, 'White Rabbit');
    const field = page.getByRole('textbox', { name: 'How I say Rabbit' });
    await field.fill('RAB-it');
    await field.press('Enter');
    await page.getByRole('button', { name: /^Pronunciation source for Rabbit: Entered by me/ }).waitFor();
    await field.scrollIntoViewIfNeeded();
  },
  'entry-pronunciation-online': async (page) => {
    await saveMerriamWebsterKey(page);
    // The "key saved" toast belongs to Settings; dismissed so it does not cover the answer this state is about.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await openForEditing(page, 'Alice');
    await page
      .locator('[data-name="Alice"]')
      .getByRole('button', { name: /Look up elsewhere/ })
      .click();
    await page.getByRole('button', { name: /^Look up online: .+ in Merriam-Webster$/ }).click();
    const answer = page.getByRole('button', { name: /^Use this: .+ as your pronunciation of / }).first();
    await answer.waitFor();
    await answer.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  },
  'verification-filter': async (page) => {
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Needs verification');
    await page.locator('[data-loose]').first().waitFor();
  },
  'loose-suggestion': async (page) => {
    await goToPage(page, 'Story Bible');
    await filterBy(page, 'Needs verification');
    await page.locator('[data-loose]').first().click();
    await page.locator('[data-suggested]').waitFor();
  },
  'entry-suggestions': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).filter({ hasText: 'White Rabbit' }).click();
    const suggested = page.locator('[data-suggested]');
    await suggested.waitFor();
    await suggested.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  },
  'import-dialog': async (page) => {
    await goToPage(page, 'Story Bible');
    await chooseAction(page, 'Import entries');
    await page.getByRole('dialog', { name: 'Import entries' }).waitFor();
  },
  'delete-confirm': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
    // Delete only exists in edit mode; the delete button is unreachable
    // while the selected entity is locked, and unlocking never happens mid-edit,
    // so unlock it first if needed - regardless of which entity sorts first.
    const unlock = page.getByRole('button', { name: 'Unlock entry' });
    if (await unlock.count()) await unlock.click();
    await clickVisible(page, 'button', 'Edit this entry');
    await clickVisible(page, 'button', 'Delete entity');
    await confirmDialog(page, 'Delete entry').waitFor();
  },
  'entry-locked': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
    const unlock = page.getByRole('button', { name: 'Lock entry' });
    if (await unlock.count()) await unlock.click();
  },
  'entry-unlocked': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
  },
  'entry-editing': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
    const unlock = page.getByRole('button', { name: 'Unlock entry' });
    if (await unlock.count()) await unlock.click();
    await clickVisible(page, 'button', 'Edit this entry');
  },
  'entry-properties-editing': async (page) => {
    await goToPage(page, 'Story Bible');
    await entryRows(page).first().click();
    const unlock = page.getByRole('button', { name: 'Unlock entry' });
    if (await unlock.count()) await unlock.click();
    await clickVisible(page, 'button', 'Edit this entry');
    await clickVisible(page, 'button', 'Add property');
    await page.getByRole('textbox', { name: 'Property 3 value' }).fill('Wren');
    await clickVisible(page, 'button', 'Save changes to this entry');
    await page.getByRole('alert').filter({ hasText: 'Give property 3 a name' }).waitFor();
    // The properties table is below the fold of the detail panel: bring it into view for the screenshot.
    await page.getByRole('table', { name: 'Properties' }).scrollIntoViewIfNeeded();
  },
  'character-voice-references': async (page) => {
    await goToPage(page, 'Story Bible');
    // The Hatter's fixture reference is changed since approval (the mock's snapshot no longer matches a current
    // region by that GUID), so selecting them shows the warning badge alongside a steady reference elsewhere.
    await entryRows(page).filter({ hasText: 'Hatter' }).click();
    await page.getByText('Reference clips').waitFor();
    await page.getByText('Changed since approval').waitFor();
    await page.getByText('Dialogue cues').waitFor();
  },
  'voice-data-panel': async (page) => {
    await goToPage(page, 'Story Bible');
    await chooseAction(page, 'Voice data');
    await page.getByRole('dialog', { name: 'Voice data' }).waitFor();
    await page.getByRole('combobox', { name: 'Approve a region for Narration' }).waitFor();
  },
  'remove-voice-data-confirm': async (page) => {
    await goToPage(page, 'Story Bible');
    await chooseAction(page, 'Voice data');
    await clickVisible(page, 'button', 'Remove voice data…');
    await confirmDialog(page, 'Remove voice data').waitFor();
  },
  'voice-samples-entry': async (page) => {
    await openWithSamples(page, 'bible');
    await entryRows(page).filter({ hasText: 'Queen of Hearts' }).click();
    const section = samplesSection(page);
    await section.getByText('Audio file missing').waitFor();
    await section.getByText('Passage changed').waitFor();
    await section.getByText('Furious, to the court').waitFor();
    await section.scrollIntoViewIfNeeded();
  },
  'voice-samples-empty': async (page) => {
    await openWithSamples(page, 'bible');
    // Alice is the entry the page opens on (category-all's picture); the White Rabbit has no sample either, and selecting it moves the detail.
    await entryRows(page).filter({ hasText: 'White Rabbit' }).first().click();
    await samplesSection(page)
      .getByText(/No voice samples yet/)
      .waitFor();
  },
  'voice-samples-limit': async (page) => {
    await openWithSamples(page, 'full');
    await entryRows(page).filter({ hasText: 'Queen of Hearts' }).click();
    await samplesSection(page).getByText('Queen of Hearts has 20 samples, the most a character can have.').waitFor();
  },
  'voice-sample-rename': async (page) => {
    await openHatterSampleMenu(page);
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('dialog', { name: 'Rename voice sample' }).waitFor();
  },
  'voice-sample-move': async (page) => {
    await openHatterSampleMenu(page);
    await page.getByRole('menuitem', { name: 'Move to a character…' }).click();
    await page.getByRole('dialog', { name: 'Move voice sample' }).waitFor();
  },
  'voice-sample-delete-confirm': async (page) => {
    await openHatterSampleMenu(page);
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await confirmDialog(page, 'Delete voice sample').waitFor();
  },
  'voice-data-samples': async (page) => {
    await openWithSamples(page, 'bible');
    await chooseAction(page, 'Voice data');
    const panel = page.getByRole('dialog', { name: 'Voice data' });
    await panel.getByText('Narration, calm').waitFor();
    await panel.getByRole('region', { name: 'Samples for a character that is no longer in the Story Bible' }).getByText('Growling').waitFor();
  },
  'remove-voice-samples-confirm': async (page) => {
    await openWithSamples(page, 'bible');
    await chooseAction(page, 'Voice data');
    await page.getByRole('dialog', { name: 'Voice data' }).getByText('Narration, calm').waitFor();
    await clickVisible(page, 'button', 'Remove voice samples…');
    await confirmDialog(page, 'Remove voice samples').waitFor();
  },
};

/** Presses an item of the page's More actions menu: the scan, the import and Voice data sit behind that one icon button. */
async function chooseAction(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** The entry rows of the Story Bible table. */
const entryRows = (page: Page) => page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]');

/** Opens an entry in edit mode, unlocking it first when the fixture locks it. */
async function openForEditing(page: Page, name: string): Promise<void> {
  await goToPage(page, 'Story Bible');
  await entryRows(page).filter({ hasText: name }).first().click();
  const unlock = page.getByRole('button', { name: 'Unlock entry' });
  if (await unlock.count()) await unlock.click();
  await clickVisible(page, 'button', 'Edit this entry');
}

/** Boots the mock with voice samples saved (`?mockVoiceSamples=`) and opens the Story Bible. */
async function openWithSamples(page: Page, seed: 'bible' | 'full'): Promise<void> {
  await page.goto(`/?mockVoiceSamples=${seed}`);
  await settlePage(page);
  await goToPage(page, 'Story Bible');
}

/** The Voice samples section of the entry that is open. */
const samplesSection = (page: Page) => page.getByRole('region', { name: 'Voice samples' });

/** The Hatter in edit mode with the menu of its one voice sample open. */
async function openHatterSampleMenu(page: Page): Promise<void> {
  await page.goto('/?mockVoiceSamples=bible');
  await settlePage(page);
  await openForEditing(page, 'Hatter');
  await samplesSection(page).getByText('Tea party, quick').waitFor();
  await page.getByRole('button', { name: 'More about Tea party, quick' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).waitFor();
}
