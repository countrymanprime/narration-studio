// How to reach each `editing` state in STATE_CATALOG (see app.drivers.ts): the Editing page.
import type { Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, clickNav, goToPage } from './shared';

/** Chapter 1 linked to its track, so its words carry their heard times. */
const LINKED = '?mockChapterLink=confirmed';
/** As LINKED, with the DAW's experimental edits on. */
const EDITS = `${LINKED}&mockDawExperimentalOn=1`;

export const editingDrivers: Record<string, Driver> = {
  default: async (page) => {
    await openEditing(page, LINKED);
  },
  selection: async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
  },
  'delete-dialog': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Delete words and audio' }).click();
    await question(page, /^Delete 4 words/).waitFor();
  },
  'fx-menu': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Add FX' }).click();
    await page
      .getByRole('menuitem', { name: /RfxChain$/ })
      .first()
      .waitFor();
  },
  'fx-dialog': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Add FX' }).click();
    await page
      .getByRole('menuitem', { name: /RfxChain$/ })
      .first()
      .click();
    await page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor();
  },
  'takes-open': async (page) => {
    await openTakes(page, EDITS);
  },
  'suggestion-step': async (page) => {
    await openTakes(page, EDITS);
    await page.getByRole('button', { name: 'Normalise' }).first().click();
    await question(page, 'Normalise?').waitFor();
  },
  'drawer-cleanup': async (page) => {
    await openDrawer(page);
    await page.getByRole('region', { name: 'Clean up findings' }).waitFor();
  },
  'drawer-effects': async (page) => {
    await openDrawer(page);
    await page.getByRole('tab', { name: /^Effects/ }).click();
    await page.getByRole('region', { name: 'Effects' }).waitFor();
  },
  'drawer-timeline': async (page) => {
    // The timeline follows the line the cursor is on: place it on the first line's second word first.
    await openEditing(page, LINKED);
    await page.locator('[data-k="p-1:1"]').click();
    await page.getByRole('button', { name: 'Clean up and effects' }).click();
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await page.getByRole('region', { name: /^Waveform and takes/ }).waitFor();
  },
  'never-checked': async (page) => {
    // Chapter 7 has no recorded fraction in the fixture, so it was never checked.
    await openEditing(page, LINKED);
    await page.getByRole('button', { name: /^Chapter: .*Change chapter$/ }).click();
    await page.getByRole('menuitemradio', { name: /^Chapter 7\b/ }).click();
    await page.getByRole('heading', { name: 'This chapter has no text yet.' }).waitFor();
  },
  'daw-off': async (page) => {
    await openEditing(page, `${LINKED}&mockDaw=Audacity`);
    await page.getByRole('button', { name: 'Retry' }).waitFor();
  },
  'no-manuscript': async (page) => {
    await page.goto('/?mockNoManuscript=1');
    await settlePage(page);
    await clickNav(page, 'Editing');
    await page.getByRole('button', { name: 'Import manuscript' }).waitFor();
  },
};

/** A question the overlay asks, by its title (a confirm is an alertdialog, a form a dialog). */
const question = (page: Page, title: string | RegExp) => page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: title }).first();

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Playback and selection' });

/** Loads `query` and opens Editing from the rail on the first chapter, its script read. */
async function openEditing(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await goToPage(page, 'Editing');
  await page.getByRole('textbox', { name: 'Script with what was heard' }).waitFor();
  await page.locator('[data-tchip]').first().waitFor();
}

/** Selects the second to the fifth word of the first line: a click, then a Shift+click. */
async function selectWords(page: Page): Promise<void> {
  await page.locator('[data-k="p-1:1"]').click();
  await page.locator('[data-k="p-1:4"]').click({ modifiers: ['Shift'] });
  await bar(page).getByText('4 words').waitFor();
}

/** Opens the first line's takes under it and scrolls them into view. */
async function openTakes(page: Page, query: string): Promise<void> {
  await openEditing(page, query);
  await page.locator('[data-tchip]').first().click();
  const takes = page.getByRole('region', { name: 'Suggested take' }).first();
  await takes.waitFor();
  await takes.scrollIntoViewIfNeeded();
}

/** Opens the drawer from the header (it starts on Clean up). */
async function openDrawer(page: Page): Promise<void> {
  await openEditing(page, LINKED);
  await page.getByRole('button', { name: 'Clean up and effects' }).click();
  await page.locator('#drawer').waitFor();
}
