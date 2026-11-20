import type { Page } from '@playwright/test';
import { scriptDrivers } from '../drivers/script';
import { selectReaderWord } from '../drivers/shared';
import { clickCase, contextMenuCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// The Script page's own overlays (components/script/): the reader's selection toolbar and the Mark menu under it, the text
// settings popover, the Mark and Define marks dialogs, the colour swatches a mark's colour box opens over that dialog, and the chapter
// and rail drawers the narrower layouts open over the reader.
// Not driven: the speaker picker, the bookmark editor and the definition source menu (each needs a state the mock reaches only
// through a long chain of steps).

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection tools' });
const selectRabbit = async (page: Page) => {
  await selectReaderWord(page, 'Rabbit');
  await toolbar(page).waitFor();
};
const textSettings = (page: Page) => page.getByRole('button', { name: /^Text settings: / });
const RAIL = 'Words, Story Bible and marks';
// A drawer is a panel of the page, not a dialog: it takes Escape while focus is inside it, and a press on its scrim otherwise
// (ScriptColumns.tsx). The scrim's top-left corner is clear of a drawer, which sits 8 px in from its side.
const closeDrawer = async (page: Page) => {
  const open = page.locator('[data-script-columns][data-drawer]');
  if ((await open.count()) === 0) return;
  await page.keyboard.press('Escape');
  if ((await open.count()) > 0) await page.locator('[data-scrim]').click({ position: { x: 2, y: 2 } });
};

const hoverVioletSwatch = async (page: Page) => {
  const swatch = page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Violet' });
  await page.mouse.move(0, 0);
  await swatch.hover();
  await page.locator('[role="tooltip"]:visible').last().waitFor({ timeout: 4000 });
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
  // The first-use tip floats over the reader's top edge; it must stay on screen and above the reader's text at every window size.
  fromState('script', 'first-use-tip', 'popover', { root: (page) => page.getByRole('complementary', { name: 'Tip' }) }),
  fromState('script', 'mark-composer'),
  fromState('script', 'rail-pronunciation-leave-confirm'),
  fromState('script', 'note-delete-confirm'),
  fromState('script', 'define-marks'),
  // The swatches of a mark's colour box: a popover over the dialog.
  fromState('script', 'define-marks-colour', 'popover'),
  {
    // Three layers: the name of a swatch, over the popover, over the dialog.
    name: 'hint on a mark colour swatch, over its popover and the dialog',
    kind: 'tooltip',
    start: 'fresh',
    scrolled: false,
    open: async (page) => {
      await scriptDrivers['define-marks-colour']!(page);
      await hoverVioletSwatch(page);
    },
    // A hint closes when the window is resized; the pointer goes back to the swatch at the narrow size.
    afterNarrowing: hoverVioletSwatch,
  },
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
