import type { Page } from '@playwright/test';
import { scriptDrivers, speakerChip, speakerPicker, wheelSpeakerChipTo } from '../drivers/script';
import { goToPage, selectReaderWord } from '../drivers/shared';
import { clickCase, contextMenuCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// The Script page's own overlays (components/script/): the reader's selection toolbar and the Mark menu under it, the text
// settings popover, the speaker picker a chip in the reader or the menu of its quoted phrase opens, the Mark and Define marks dialogs, the colour swatches a mark's
// colour box opens over that dialog, and the chapter and rail drawers the narrower layouts open over the reader.
// Not driven: the bookmark editor and the definition source menu (each needs a state the mock reaches only through a long chain of
// steps).

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection tools' });
const selectRabbit = async (page: Page) => {
  await selectReaderWord(page, 'Rabbit');
  await toolbar(page).waitFor();
};
const textSettings = (page: Page) => page.getByRole('button', { name: /^Text settings: / });
// The speaker picker opens at the chip pressed (#3823: it ran off the bottom of the window), or at the quoted phrase when it is opened from
// the phrase's menu. The mock book has one chip, at the start of a line, so the reader is wheeled to put it against the top or the bottom of
// the reader, where the picker has room on one side only; `wheelSpeakerChipTo` fails the case when the chip is not there.
const pressChip =
  (edge?: 'top' | 'bottom') =>
  async (page: Page): Promise<void> => {
    if (edge) await wheelSpeakerChipTo(page, edge);
    await speakerChip(page).click();
    await speakerPicker(page).waitFor();
  };
const phraseMenu = contextMenuCase('context menu on the quoted phrase');
/** The picker's second way in: "Speaker: …" in the menu of the quoted phrase, which anchors it to the phrase's box and not to the chip. */
const pickFromPhraseMenu = async (page: Page): Promise<void> => {
  await wheelSpeakerChipTo(page, 'bottom');
  const line = await page
    .locator('[data-ph]')
    .first()
    .evaluate((phrase) => {
      const first = phrase.getClientRects()[0];
      return { x: first.left + first.width / 2, y: first.top + first.height / 2 };
    });
  await phraseMenu.open(page, { label: 'the quoted phrase', ...line });
  await page.getByRole('menuitem', { name: /^Speaker: / }).click();
  await speakerPicker(page).waitFor();
};
const firstUseTip = (page: Page) => page.getByRole('complementary', { name: 'Tip' });
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
  { name: 'speaker picker', kind: 'popover', root: speakerPicker, open: pressChip() },
  { name: 'speaker picker, chip at the top of the reader', kind: 'popover', root: speakerPicker, open: pressChip('top') },
  { name: 'speaker picker, chip at the bottom of the reader', kind: 'popover', root: speakerPicker, open: pressChip('bottom') },
  { name: 'speaker picker from the menu of a quoted phrase at the bottom of the reader', kind: 'popover', root: speakerPicker, open: pickFromPhraseMenu },
  {
    // Not "over" it: the press on the chip closes the text settings popover (two popovers are never open together), and the picker must still open
    // on top and on screen.
    name: 'speaker picker opened while the text settings popover is open',
    kind: 'popover',
    root: speakerPicker,
    over: { name: 'text settings popover', open: async (page) => textSettings(page).click() },
    open: pressChip(),
    // In a 320x300 window the text settings popover lies over the chip, so there is no chip to press while it is open.
    viewports: ({ height }) => height > 300,
  },
  {
    // Over an overlay that stays open: the first-use tip floats over the top of the reader, and the picker of a chip at the top opens across it.
    name: 'speaker picker over the first-use tip',
    kind: 'popover',
    root: speakerPicker,
    start: 'fresh',
    open: async (page) => {
      await goToPage(page, 'Script', { keepTips: true });
      await firstUseTip(page).waitFor();
      await pressChip('top')(page);
      const [picker, tip] = [await speakerPicker(page).boundingBox(), await firstUseTip(page).boundingBox()];
      const across =
        picker && tip && picker.x < tip.x + tip.width && tip.x < picker.x + picker.width && picker.y < tip.y + tip.height && tip.y < picker.y + picker.height;
      if (!across) throw new Error('the speaker picker does not lie across the first-use tip, so this case measured nothing');
    },
    // Below 768 px the tip is as wide as the reader and lies over a chip at the top, so there is no chip to press under it.
    viewports: ({ width }) => width >= 768,
  },
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
