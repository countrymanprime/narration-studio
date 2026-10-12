// How to reach each `script` state in STATE_CATALOG (see app.drivers.ts): the Studio Next Script page (SN-B77, swapped in by SN-B8).
import type { Locator, Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, chooseTheme, clickNav, clickVisible, goToPage, selectReaderWord } from './shared';

const RAIL = 'Words, Story Bible and marks';

export const scriptDrivers: Record<string, Driver> = {
  'invalid-payload': async (page) => {
    await page.goto('/?mockInvalidPayload=manuscript');
    await settlePage(page);
    // The page's own content never loads here, so goToPage (which waits for it) is not used: the inline error is the proof.
    await clickNav(page, 'Script');
    // The words are on screen twice: Home's audiobook estimate read the same chapters first and raised a notice that stays (ADR 0075), and
    // the page then shows its own inline error. Wait for each by what it is, so neither the state nor a strict-mode locator depends on
    // which of the two rendered first.
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    await page.locator('[data-tone="error"]').getByText('The app received data it could not read.').waitFor();
  },
  reader: async (page) => {
    await goToPage(page, 'Script');
    await page.getByRole('heading', { level: 2, name: 'Chapter 1' }).first().waitFor();
  },
  'rail-words': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'tired');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up' }).click();
    const rail = await openRail(page);
    await rail
      .getByRole('group', { name: /^Word: / })
      .first()
      .waitFor();
  },
  'rail-story-bible': async (page) => openRailTab(page, 'Story Bible'),
  'rail-notes': async (page) => openRailTab(page, 'Notes'),
  'rail-queries': async (page) => openRailTab(page, 'Queries'),
  'rail-bookmarks': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'Rabbit');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Bookmark here' }).click();
    await openRailTab(page, 'Bookmarks', false);
  },
  'chapter-list': async (page) => {
    await goToPage(page, 'Script');
    const drawerButton = page.getByRole('button', { name: 'Chapters', exact: true });
    if (await drawerButton.isVisible()) await drawerButton.click();
    const list = page.getByRole('list', { name: 'Chapters' }).and(page.locator(':visible'));
    await list.getByRole('button', { name: /Chapter 3/ }).click();
    // Choosing a chapter closes the drawer; it is opened again on the chapter now current, which is the picture.
    if (await drawerButton.isVisible()) await drawerButton.click();
    await list
      .locator('[aria-current="true"]')
      .getByText(/Chapter 3|Pool of Tears/)
      .first()
      .waitFor();
  },
  find: async (page) => {
    await goToPage(page, 'Script');
    await page.getByRole('button', { name: 'Find in the manuscript (Ctrl+F)' }).click();
    await page.getByRole('textbox', { name: 'Find in the manuscript' }).fill('Alice');
    // The results list opens on focus once there are matches; Results opens it when it has not.
    const results = page.getByRole('region', { name: 'Search results' });
    const toggle = page.getByRole('button', { name: 'Results' });
    await page.getByRole('status').filter({ hasText: /\d/ }).first().waitFor();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await results.waitFor();
  },
  'selection-tools': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'Rabbit');
    await page.getByRole('toolbar', { name: 'Selection tools' }).waitFor();
  },
  'mark-composer': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'Rabbit');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
    await page.getByRole('menuitem').first().click();
    await page.getByRole('dialog').waitFor();
  },
  'define-marks': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'Rabbit');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Define marks…' }).click();
    await page.getByRole('dialog', { name: 'Define how you mark up' }).waitFor();
  },
  'text-settings': async (page) => {
    await goToPage(page, 'Script');
    await page.getByRole('button', { name: /^Text settings: / }).click();
    await page.getByLabel('Text settings', { exact: true }).getByRole('combobox', { name: 'Font' }).waitFor();
  },
  'credits-cards': async (page) => {
    await goToPage(page, 'Script');
    // The default mock project has no Title/Author/Narrator value set, so the shipped opening template's tokens render as unresolved
    // chips (C6): expanding the card shows both the chip and the "unresolved token(s)" count.
    await clickVisible(page, 'button', 'Opening credits');
    await page.getByText(/unresolved token/).waitFor();
  },
  // The credits-setup banner and the credits card's own Fill in button: the mock's setup seam.
  'credits-setup-banner': async (page) => {
    await page.goto('/?mockCredits=setup');
    await settlePage(page);
    // Home's own dialog opens first (it is modal, so the nav below is unreachable until it closes): dismiss it for the session, leaving
    // the page's own banner.
    await clickVisible(page, 'button', 'Not now');
    await goToPage(page, 'Script');
    await clickVisible(page, 'button', 'Opening credits');
    await page.getByText(/The credits need 3 values/).waitFor();
    await page.getByRole('button', { name: 'Fill in' }).first().waitFor();
  },
  // The retail sample: ?mockCredits=extras picks lines 1-3 of Chapter 3, reached from the chapter list.
  'retail-sample': async (page) => {
    await page.goto('/?mockCredits=extras');
    await settlePage(page);
    await goToPage(page, 'Script');
    const drawerButton = page.getByRole('button', { name: 'Chapters', exact: true });
    if (await drawerButton.isVisible()) await drawerButton.click();
    await page
      .getByRole('list', { name: 'Chapters' })
      .and(page.locator(':visible'))
      .getByRole('button', { name: /Chapter 3/ })
      .click();
    await page.getByText(/Retail sample starts/).waitFor();
  },
  'reader-dark': async (page) => {
    await chooseTheme(page, 'Dark');
    await goToPage(page, 'Script');
  },
};

/** The rail as the width shows it: the column from 1281 px, else the drawer the reader header's side-panel button opens. */
async function openRail(page: Page): Promise<Locator> {
  const rail = page
    .getByRole('region', { name: RAIL })
    .or(page.locator(`section[aria-label="${RAIL}"]`))
    .first();
  if (!(await rail.isVisible())) await page.getByRole('button', { name: RAIL }).click();
  await rail.waitFor();
  return rail;
}

async function openRailTab(page: Page, tab: string, load = true): Promise<void> {
  if (load) await goToPage(page, 'Script');
  const rail = await openRail(page);
  await rail.getByRole('tab', { name: tab, exact: true }).click();
  await rail.getByRole('tab', { name: tab, exact: true, selected: true }).waitFor();
}
