import type { Page } from '@playwright/test';
import { selectReaderWord } from '../drivers/shared';
import { clickCase, contextMenuCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// The Script page's own overlays (components/script/): the reader's selection toolbar and the Mark menu under it, the text
// settings popover, the Mark and Define marks dialogs, and the chapter and rail drawers the narrower layouts open over the reader.
// Not driven: the speaker picker, the bookmark editor and the definition source menu (each needs a state the mock reaches only
// through a long chain of steps).

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection tools' });
const selectRabbit = async (page: Page) => {
  await selectReaderWord(page, 'Rabbit');
  await toolbar(page).waitFor();
};
const textSettings = (page: Page) => page.getByRole('button', { name: /^Text settings: / });
const RAIL = 'Words, Story Bible and marks';
// A drawer is a panel of the page, not a dialog: it takes Escape while focus is inside it (ScriptColumns.tsx).
const closeDrawer = async (page: Page) => {
  if ((await page.locator('[data-script-columns][data-drawer]').count()) > 0) await page.keyboard.press('Escape');
};

export const scriptCases: OverlayCase[] = [
  { name: 'selection toolbar', kind: 'popover', root: toolbar, open: selectRabbit },
  {
    name: 'Mark menu under the selection toolbar',
    kind: 'menu',
    open: async (page) => {
      await selectRabbit(page);
      await toolbar(page).getByRole('button', { name: 'Mark', exact: true }).click();
    },
  },
  clickCase('text settings popover', 'popover', textSettings),
  // A context menu while the text settings popover is open.
  contextMenuCase('context menu over the text settings popover', {
    over: { name: 'text settings popover', open: async (page) => textSettings(page).click() },
  }),
  fromState('script', 'mark-composer'),
  fromState('script', 'define-marks'),
  {
    // The chapter list is a column from 1180 px; below it a drawer behind the Chapters button (src/layoutBreakpoints.ts).
    name: 'chapter drawer',
    kind: 'slide-over',
    root: (page) => page.locator('[data-panel="chapters"]'),
    close: closeDrawer,
    open: async (page) => {
      await page.getByRole('button', { name: 'Chapters', exact: true }).click();
    },
    viewports: ({ width }) => width < 1180,
  },
  {
    // The rail is a column from 1281 px; below it a drawer behind the reader header's side-panel button.
    name: 'rail drawer',
    kind: 'slide-over',
    root: (page) => page.locator('[data-panel="rail"]'),
    close: closeDrawer,
    open: async (page) => {
      await page.getByRole('button', { name: RAIL }).click();
    },
    viewports: ({ width }) => width < 1281,
  },
];
