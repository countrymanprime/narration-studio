import type { Page } from '@playwright/test';
import { fromState, hoverCase, type OverlayCase } from '../helpers/overlayGuardFor';

// The Story Bible's own overlays (components/storybible/): the hints on the header's icon buttons, the kind menu of an entry in Edit, the menu of a
// voice sample and its Rename, Move and Delete dialogs,
// the right-click menu of an entry row, and the dialogs, the language-model and voice prompts and the Voice data panel that the catalog's
// state drivers already reach. Not driven: the Sort and speaker-colour selects (native selects, whose popup the browser draws outside
// the page where `elementFromPoint` cannot see it), the pronunciation source menu and the review slide-over (each needs a chain of
// steps the mock reaches only inside a driver), and a toast raised while a dialog is open, which the guard would fail today (the
// toast sits under dialogs: see the Story Bible PR).

const firstRow = (page: Page) => page.getByRole('list', { name: 'Story Bible entries' }).getByRole('button').first();
const header = (page: Page, label: string) => page.getByRole('button', { name: label });

export const storyBibleCases: OverlayCase[] = [
  hoverCase('hint on Scan', (page) => header(page, 'Scan the manuscript for suggestions')),
  hoverCase('hint on Import entries', (page) => header(page, 'Import entries (CSV or JSON)')),
  hoverCase('hint on Voice data', (page) => header(page, 'Voice data')),
  hoverCase('hint on Build / refresh', (page) => header(page, 'Build / refresh Story Bible')),
  hoverCase('hint on Add entity', (page) => header(page, 'Add entity')),
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
  fromState('storybible', 'import-dialog'),
  fromState('storybible', 'language-model-confirm'),
  fromState('storybible', 'voice-download-confirm'),
  fromState('storybible', 'rebuild-running'),
  fromState('storybible', 'voice-data-panel', 'dialog', { root: (page) => page.getByRole('dialog', { name: 'Voice data' }) }),
  fromState('storybible', 'remove-voice-data-confirm'),
  fromState('storybible', 'voice-sample-menu', 'menu'),
  fromState('storybible', 'voice-sample-rename'),
  fromState('storybible', 'voice-sample-move'),
  fromState('storybible', 'voice-sample-delete-confirm'),
  fromState('storybible', 'remove-voice-samples-confirm'),
];
