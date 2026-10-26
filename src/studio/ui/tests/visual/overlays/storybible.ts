import type { Page } from '@playwright/test';
import { goToPage } from '../drivers/shared';
import { fromState, hoverCase, type OverlayCase } from '../helpers/overlayGuardFor';
import { settlePage } from '../helpers/settle';

// The Story Bible's own overlays (components/storybible/): the hint on the header's menu button and the menu it opens, the kind menu of an entry in Edit, the menu of a
// voice sample and its Rename, Move and Delete dialogs, the right-click menu of an entry row, and the dialogs, the voice prompt and the Voice data panel that the catalog's
// state drivers already reach. Not driven: the speaker-colour select (native selects, whose popup the browser draws outside
// the page where `elementFromPoint` cannot see it), the pronunciation source menu and the review slide-over (each needs a chain of
// steps the mock reaches only inside a driver), and a toast raised while a dialog is open, which the guard would fail today (the
// toast sits under dialogs: see the Story Bible PR).

const firstRow = (page: Page) => page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').first();
const header = (page: Page, label: string) => page.getByRole('button', { name: label });

export const storyBibleCases: OverlayCase[] = [
  hoverCase('hint on More actions', (page) => header(page, 'More actions')),
  {
    // The page's secondary actions (scan, import, Voice data) behind one icon button at the right edge of the header.
    name: 'actions menu',
    kind: 'menu',
    open: async (page) => {
      await header(page, 'More actions').click();
      await page.getByRole('menuitem', { name: 'Voice data' }).waitFor();
    },
  },
  {
    // The Filter menu over the entry table (SNB-D3): Kind, Pronunciation and Show, which stays open while choices are made.
    name: 'filter menu',
    kind: 'menu',
    open: async (page) => {
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page.getByRole('menuitemradio', { name: /^Has one/ }).waitFor();
    },
  },
  {
    // The Sort menu beside the Filter button: one order, chosen and closed.
    name: 'sort menu',
    kind: 'menu',
    open: async (page) => {
      await page.getByRole('button', { name: /^Sort:/ }).click();
      await page.getByRole('menuitemradio', { name: 'Most mentioned' }).waitFor();
    },
  },
  {
    // A right click on an entry row (the mock's registerContext for the Bible page).
    name: 'entry row menu',
    kind: 'context-menu',
    open: async (page) => {
      await firstRow(page).click({ button: 'right' });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  {
    // The kind pill is a menu only while the entry is in Edit.
    name: 'kind menu of an entry in Edit',
    kind: 'menu',
    scrolled: false,
    open: async (page) => {
      // The kind chips in the list carry the same names, so look inside the entry's own panel (its heading is the entry's name).
      const entry = page.locator('section', { has: page.getByRole('button', { name: 'Find in the manuscript' }) });
      await entry.getByRole('button', { name: 'Edit this entry' }).click();
      await entry
        .getByRole('button', { name: /^(Character|Place|Organization|Lore|Item|Event)\b/ })
        .first()
        .click();
    },
  },
  fromState('storybible', 'delete-confirm'),
  fromState('storybible', 'relationship-picker', 'dialog'),
  fromState('storybible', 'import-dialog'),
  fromState('storybible', 'voice-download-confirm'),
  fromState('storybible', 'voice-data-panel', 'dialog', { root: (page) => page.getByRole('dialog', { name: 'Voice data' }) }),
  fromState('storybible', 'remove-voice-data-confirm'),
  fromState('storybible', 'delete-story-bible-confirm'),
  {
    // The menu of the Hatter's voice sample while its entry is in Edit. Opened here and not as a catalog state: the Menu primitive's focus guards
    // and portal draw axe findings that no catalog row can declare, and the page's other menus are guarded the same way.
    name: 'menu of a voice sample',
    kind: 'menu',
    start: 'fresh',
    // The menu stays anchored to its row when the page scrolls under it, as the kind menu's does, so it is checked where it opens.
    scrolled: false,
    // Not at 320x300: the row's menu button is below the fold of a 300 px window when the menu opens (a fresh load draws the page at its first size), so the
    // menu opens off screen; listed as not covered, as the word menu is in Editing.
    viewports: ({ height }) => height >= 500,
    open: async (page) => {
      await page.goto('/?mockVoiceSamples=bible');
      await settlePage(page);
      await goToPage(page, 'Story Bible');
      await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').filter({ hasText: 'Hatter' }).first().click();
      const unlock = page.getByRole('button', { name: 'Unlock entry' });
      if (await unlock.count()) await unlock.click();
      await page.getByRole('button', { name: 'Edit this entry' }).click();
      await page.getByRole('button', { name: 'More about Tea party, quick' }).click();
      await page.getByRole('menuitem', { name: 'Delete…' }).waitFor();
    },
  },
  fromState('storybible', 'voice-sample-rename'),
  fromState('storybible', 'voice-sample-move'),
  fromState('storybible', 'voice-sample-delete-confirm'),
  fromState('storybible', 'remove-voice-samples-confirm'),
];
