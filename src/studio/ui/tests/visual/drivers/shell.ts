// How to reach each `shell` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, goToPage, productionLoaded, PAGE_HEADING } from './shared';
import { openJumpMenuOnCommands } from './jump';

export const shellDrivers: Record<string, Driver> = {
  // Back, Forward, Undo, History and the zoom steps are jump-menu commands (the header is the Studio Next mock's: no buttons for them).
  // After one in-app move the jump menu, narrowed to commands, lists Back on and Forward off with its reason (the default first page has both off).
  'jump-menu-back-enabled': async (page) => {
    // Story Bible, not Script: Script's reader carries its own pre-existing nested-interactive debt (#155, catalogued as flake 3 on #509) this row has no reason to inherit.
    await goToPage(page, 'Story Bible');
    await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').first().waitFor();
    await openJumpMenuOnCommands(page, 'back');
    await page.getByRole('option', { name: /^Back/ }).waitFor();
    await page.getByRole('option', { name: /^Back/ }).and(page.locator(':not([aria-disabled="true"])')).waitFor();
  },
  // After a Back from that page, both Back and Forward are on.
  'jump-menu-forward-enabled': async (page) => {
    await goToPage(page, 'Script');
    await openJumpMenuOnCommands(page, 'back');
    await page.getByRole('option', { name: /^Back/ }).click();
    await page.getByRole('heading', { level: 1, name: PAGE_HEADING.Production, exact: true }).waitFor();
    await openJumpMenuOnCommands(page, 'forward');
    await page
      .getByRole('option', { name: /^Forward/ })
      .and(page.locator(':not([aria-disabled="true"])'))
      .waitFor();
  },
  // The "Built-in recorder" state, reached through the mock flag (?mockEngine=builtin).
  'engine-builtin': async (page) => {
    await page.goto('/?mockEngine=builtin');
    await settlePage(page);
    await productionLoaded(page);
    await page.getByLabel(/^Built-in: Recording happens in the app/).waitFor();
  },
  // The header's mismatch state, simulating a live REAPER heartbeat whose open project disagrees with the
  // linked file - the mock never grows one on its own (see main.tsx).
  'engine-mismatch': async (page) => {
    await page.goto('/?mockDawMismatch=1');
    await settlePage(page);
    await productionLoaded(page);
    await page.getByRole('button', { name: /^REAPER: Other project\. A different project is open/ }).waitFor();
  },
  // The zoom chip at a non-100% level (?mockZoom=125): it is drawn only off 100%, so it needs the flag to be seen without driving Ctrl+wheel first.
  'zoom-level': async (page) => {
    await page.goto('/?mockZoom=125');
    await settlePage(page);
    await productionLoaded(page);
    await page.getByRole('button', { name: 'Zoom 125%: change in the jump menu' }).waitFor();
  },
  // The chip pressed: the jump menu opens at the Zoom commands, Reset on because zoom is off 100%.
  'zoom-menu-open': async (page) => {
    await page.goto('/?mockZoom=125');
    await settlePage(page);
    await productionLoaded(page);
    await page.getByRole('button', { name: 'Zoom 125%: change in the jump menu' }).click();
    await page.getByRole('option', { name: /^Reset zoom to 100%/ }).waitFor();
  },
  // The project name pressed: the project picker opens over the open project, with Back to return to it.
  'switch-project-open': async (page) => {
    await productionLoaded(page);
    await page.getByRole('button', { name: /, switch project$/ }).click();
    await page.getByRole('heading', { name: 'Choose your project' }).waitFor();
    await page.getByRole('button', { name: /^Back to / }).waitFor();
  },
  // The jump menu, opened from the header's button as a narrator would.
  'jump-menu-open': async (page) => {
    await productionLoaded(page);
    await page.getByRole('button', { name: /Jump to or run/ }).click();
    await page.getByRole('combobox', { name: 'Jump menu' }).waitFor();
  },
  // A right-click on the page's padding, where no provider owns the target: the shell's fallback menu.
  'context-menu-open': async (page) => {
    await productionLoaded(page);
    await page.locator('main .scroll-chrome-hidden').click({ button: 'right', position: { x: 6, y: 6 } });
    await page.getByRole('menu').waitFor();
  },
  'nav-off-note': async (page) => {
    await page.goto('/?mockNoManuscript=1');
    await settlePage(page);
    // Below `md` the navigation is the drawer; the item is in it. The pointer stays where the press left it, so the note is what is shown.
    const menuButton = page.getByRole('button', { name: 'Open navigation' });
    let scope = page.locator('aside:visible').first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      scope = page.getByRole('dialog', { name: 'Navigation' });
    }
    // Forced: Playwright reads aria-disabled as "not enabled" and would wait forever, but an off item takes the press (it opens the note).
    await scope.getByRole('button', { name: 'Proof' }).click({ force: true });
    await page.getByRole('dialog', { name: 'Proof is unavailable' }).waitFor();
  },
  'jump-menu-off-pages': async (page) => {
    await page.goto('/?mockNoManuscript=1');
    await settlePage(page);
    await page.getByRole('button', { name: /Jump to or run/ }).click();
    const field = page.getByRole('combobox', { name: 'Jump menu' });
    await field.fill('go to');
    await page.getByRole('option', { name: /^Go to Proof/ }).waitFor();
  },
  // The History panel opens from the jump menu's command (the header's History button is gone) and from Ctrl+Shift+H.
  'history-panel-open': async (page) => {
    await productionLoaded(page);
    await openJumpMenuOnCommands(page, 'open the undo history');
    await page.getByRole('option', { name: /^Open the undo history/ }).click();
    await page.getByRole('dialog', { name: 'Undo history' }).waitFor();
  },
};
