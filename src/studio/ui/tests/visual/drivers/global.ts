// How to reach each `global` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, chooseTheme, clickVisible, compareRun, confirmDialog, freezeClock, goToPage, openBooth, openProofChapter } from './shared';

export const globalDrivers: Record<string, Driver> = {
  tooltip: async (page) => {
    // The first KPI tile of the Production home carries a tooltip (what the figure counts). Below 1360 px the rail opens over the page
    // while the pointer is on it, so park the pointer mid-page first or the rail covers the tile.
    const viewport = page.viewportSize();
    if (viewport) await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.getByRole('list', { name: 'Production figures' }).getByRole('button').first().hover();
    // TooltipTarget shows its tooltip 1s after hover - wait for it, don't race it.
    await page.getByRole('tooltip').waitFor();
  },
  // The collapsed rail at rest: the pointer is parked mid-page, off the rail, so it stays icons-only (it opens on hover or focus).
  'nav-rail-collapsed': async (page) => {
    const viewport = page.viewportSize();
    if (viewport) await page.mouse.move(viewport.width / 2, viewport.height / 2);
  },
  'nav-rail-collapsed-dark': async (page) => {
    await chooseTheme(page, 'Dark');
    await goToPage(page, 'Production');
    const viewport = page.viewportSize();
    if (viewport) await page.mouse.move(viewport.width / 2, viewport.height / 2);
  },
  // The collapsed rail (860 to 1359 CSS px) opens over the page on hover, with its labels and group headings; at 1360 and above the wide
  // rail is already open, and below 860 there is no rail (the hamburger and drawer replace it), so there is nothing to hover and the state is the page as it was.
  'nav-rail-open': async (page) => {
    const width = page.viewportSize()?.width ?? 0;
    if (width >= 1360 || width < 860) return;
    const rail = page.getByRole('complementary', { name: 'Primary navigation' });
    await rail.getByRole('button', { name: /^Pickups/ }).hover();
    await page.waitForFunction(() => (document.querySelector('aside[aria-label="Primary navigation"] > div')?.getBoundingClientRect().width ?? 0) > 200);
  },
  // Below 860 CSS px the top bar's Open navigation button opens the navigation drawer; from 860 px there is a rail and no button.
  'nav-drawer-open': async (page) => {
    if ((page.viewportSize()?.width ?? 0) >= 860) return;
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('dialog', { name: 'Navigation' })
      .getByRole('button', { name: /^Pickups/ })
      .waitFor();
  },
  toast: async (page) => {
    await openProofChapter(page);
    // Scrolled as proof-chapter/compare-toast scrolls it (its openCompare), so the two pictures stay the same.
    await compareRun(page).evaluate((run) => run.scrollIntoView({ block: 'start' }));
    // Suggesting hints from the manuscript answers with a toast (adding a term answers with none), and an information toast
    // fades on a real 5 s timer: freeze timers so it cannot race the screenshot.
    await freezeClock(page);
    await clickVisible(page, 'button', 'Suggest from manuscript');
    await page.locator('[data-tone]').first().waitFor();
  },
  'confirm-dialog': async (page) => {
    await goToPage(page, 'Story Bible');
    await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').first().click();
    const unlock = page.getByRole('button', { name: 'Unlock entry' });
    if (await unlock.count()) await unlock.click();
    await clickVisible(page, 'button', 'Edit this entry');
    await clickVisible(page, 'button', 'Delete entity');
    await confirmDialog(page, 'Delete entry').waitFor();
    // Base UI's scroll lock only reserves a scrollbar gutter on <html> when the document itself can scroll:
    // with the document locked, a modal over Story Bible must leave no inline scrollbar-gutter behind.
    await page.waitForFunction(() => document.documentElement.style.scrollbarGutter === '');
  },
  'background-check-notice': async (page) => {
    await page.goto('/?mockBackgroundChecks=confirm');
    await settlePage(page);
    await page.getByRole('alertdialog', { name: 'Check recordings in the background?' }).waitFor();
  },
  'background-check-running': async (page) => {
    await page.goto('/?mockBackgroundChecks=running');
    await settlePage(page);
    await goToPage(page, 'Editing');
    await page
      .getByRole('region', { name: 'Background recording check' })
      .getByText(/in the background · 42%/)
      .waitFor();
  },
  'background-check-booth': async (page) => {
    await openBooth(page, '?mockBackgroundChecks=running');
    await page.getByRole('button', { name: /Checking in the background · 42%/ }).waitFor();
  },
  'background-check-hidden': async (page) => {
    await page.goto('/?mockBackgroundChecks=running');
    await settlePage(page);
    await goToPage(page, 'Editing');
    await page.getByRole('region', { name: 'Background recording check' }).getByRole('button', { name: 'Hide' }).click();
    await page.getByRole('button', { name: /Checking in the background · 42%/ }).waitFor();
  },
  'background-check-waiting': async (page) => {
    await page.goto('/?mockBackgroundChecks=waiting');
    await settlePage(page);
    await page
      .getByRole('region', { name: 'Background recording check' })
      .getByText(/waiting to be checked/)
      .waitFor();
  },
  'shortcut-sheet': async (page) => {
    await goToPage(page, 'Production');
    // The registry's own binding (commands.catalog.ts: `help.shortcuts`), by physical key rather than the
    // character it types - same as a real Shift+Slash keydown.
    await page.keyboard.press('Shift+Slash');
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  },
  'theme-light': async (page) => {
    // Light is the default theme, so the Production home after choosing it is `production/no-data`'s picture: stay where it was chosen.
    await chooseTheme(page, 'Light');
  },
  'theme-dark': async (page) => {
    await chooseTheme(page, 'Dark');
    await goToPage(page, 'Production');
  },
};
