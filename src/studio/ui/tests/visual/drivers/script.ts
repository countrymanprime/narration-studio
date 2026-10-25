// How to reach each `script` state in STATE_CATALOG (see app.drivers.ts): the Studio Next Script page (SN-B77, swapped in by SN-B8).
import { expect, type Locator, type Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, chooseTheme, clickNav, clickVisible, goToPage, selectReaderWord, openWithoutManuscript } from './shared';

const RAIL = 'Words, Story Bible and marks';

export const scriptDrivers: Record<string, Driver> = {
  // The chapters never answer, so `goToPage` (which waits for the reader) is not used.
  loading: async (page) => {
    await page.goto('/?mockChapters=loading');
    await settlePage(page);
    await clickNav(page, 'Script');
    await page.getByRole('group', { name: 'Loading the Script' }).waitFor();
  },
  'invalid-payload': async (page) => {
    await page.goto('/?mockInvalidPayload=manuscript');
    await settlePage(page);
    // The page's own content never loads here, so goToPage (which waits for it) is not used: the inline error is the proof.
    await clickNav(page, 'Script');
    // The page shows its own inline error with Retry, and the toast that said the same is cleared by it (#2494), so the words are on
    // screen once.
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    await page.getByText('The app received data it could not read.').waitFor();
    await page.locator('[data-tone]').first().waitFor({ state: 'detached' });
  },
  reader: async (page) => {
    await goToPage(page, 'Script');
    await page.getByRole('heading', { level: 2, name: 'Down the Rabbit-Hole' }).first().waitFor();
  },
  'rail-words': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'tired');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Look up in the dictionary or the Story Bible' }).click();
    const rail = await openRail(page);
    await rail
      .getByRole('group', { name: /^Word: / })
      .first()
      .waitFor();
  },
  'rail-story-bible': async (page) => openRailTab(page, 'Story Bible'),
  'rail-notes': async (page) => openRailTab(page, 'Notes'),
  // The first-use tip over the reader, as the narrator meets it the first time Script opens.
  'first-use-tip': async (page) => {
    await goToPage(page, 'Script', { keepTips: true });
    await page.getByRole('complementary', { name: 'Tip' }).waitFor();
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
  'reader-context-menu': async (page) => {
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'tired');
    await page.getByRole('toolbar', { name: 'Selection tools' }).waitFor();
    const at = await page.evaluate(() => {
      const box = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    // The selection toolbar can sit over the word it belongs to; the menu answers for the word under the pointer as well, so close the toolbar first.
    await page.keyboard.press('Escape');
    await page.getByRole('toolbar', { name: 'Selection tools' }).waitFor({ state: 'detached' });
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Mark as' }).waitFor();
  },
  'skip-to-side-panel': async (page) => {
    await goToPage(page, 'Script');
    const skip = page.getByRole('button', { name: 'Skip to the side panel' });
    await skip.focus();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Skip to the side panel');
  },
  'bookmark-added': async (page) => {
    await goToPage(page, 'Script');
    await page.getByRole('region', { name: /^Script reader/ }).focus();
    await page.keyboard.press('b');
    await page.getByText('Bookmark added.').waitFor();
    // The new bookmark's editor opens by itself; the picture is the toast and the ribbon, so close the editor.
    await page.keyboard.press('Escape');
    // Focus returns to the ribbon, whose tooltip would be portalled outside the landmarks.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page
      .locator('[role="tooltip"]')
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
  },
  // The jump menu on the Script: the page's own groups first, under "On this page".
  'jump-menu': async (page) => {
    await goToPage(page, 'Script');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Jump menu' }).waitFor();
    await page.getByRole('option', { name: /^Chapters/ }).waitFor();
  },
  // Ctrl+F searches the page: the term is typed into the menu and the manuscript's matches come back under "In the script".
  'search-menu': async (page) => {
    await goToPage(page, 'Script');
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('Alice');
    await page.getByRole('listbox', { name: 'Jump menu results' }).getByRole('option').first().waitFor();
    await page.getByText('In the script', { exact: true }).waitFor();
  },
  'search-shown': async (page) => {
    await goToPage(page, 'Script');
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('Alice');
    await page.getByText('In the script', { exact: true }).waitFor();
    // A Story Bible entry named Alice is listed first; a match in the text names its chapter and paragraph.
    await page.getByRole('option', { name: /¶/ }).first().click();
    await page.getByRole('combobox', { name: 'Jump menu' }).waitFor({ state: 'detached' });
    await page.locator('mark[data-kind="search"]').first().waitFor();
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
    // chips (C6): the credits' card counts them under its facts. The chapter list's row goes to the credits.
    await page
      .getByRole('list', { name: 'Chapters' })
      .getByRole('button', { name: /Opening credits$/ })
      .first()
      .click();
    await page
      .getByText(/unresolved token/)
      .first()
      .waitFor();
  },
  // The credits-setup banner and the credits card's own Fill in button: the mock's setup seam.
  'credits-setup-banner': async (page) => {
    await page.goto('/?mockCredits=setup');
    await settlePage(page);
    // Home's own dialog opens first (it is modal, so the nav below is unreachable until it closes): dismiss it for the session, leaving
    // the page's own banner.
    await clickVisible(page, 'button', 'Not now');
    await goToPage(page, 'Script');
    // The banner sits at the top of the book, above the Opening credits.
    await page.getByText(/The credits need 3 values/).waitFor();
    // The reader opens on Chapter 1, below the banner, and a scroll to its top alone does not stay: the chapter list's Opening credits row (in
    // the drawer below the wide layout) takes it to the credits first, as it takes a narrator.
    const drawerButton = page.getByRole('button', { name: 'Chapters', exact: true });
    if (await drawerButton.isVisible()) await drawerButton.click();
    await page
      .getByRole('list', { name: 'Chapters' })
      .and(page.locator(':visible'))
      .getByRole('button', { name: /Opening credits$/ })
      .first()
      .click();
    // The row puts the credits card at the top of the reader, which leaves the banner just above it: step back to it.
    await page.getByRole('region', { name: /^Script reader/ }).evaluate((reader) => (reader.scrollTop = 0));
    await expect(page.getByText(/The credits need 3 values/)).toBeInViewport();
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
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Script');
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
