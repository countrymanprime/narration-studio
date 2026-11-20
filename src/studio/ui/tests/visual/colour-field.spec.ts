// The colour field at its six sites (#3680): a palette box in Settings' Entry types and in Define how you mark up, a row of swatches for a
// Story Bible speaker, and a picker with a hex box in Proof's Compare options, Settings' Note colour and the Compare defaults panel. At the
// desktop width and at 390 px, in both themes: the swatches a box opens stay inside the window and over what opened them, a row of swatches
// wraps inside its editor, a picker and its hex box share a line, and each passes axe.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { proofChapterDrivers } from './drivers/proof-chapter';
import { scriptDrivers } from './drivers/script';
import { settingsDrivers } from './drivers/settings';
import { openSettings, showSettingsRow } from './drivers/shared';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';
import { MIN_CONTROL_WIDTH_PX } from './lib/validators';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const POPUP = '[data-popover-popup]';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core'), 'utf8');

async function open(page: Page, size: { width: number; height: number }, theme: Theme, driver: ((page: Page) => Promise<void>) | undefined): Promise<void> {
  if (!driver) throw new Error('colour-field.spec.ts names a driver that tests/visual/drivers no longer has');
  await page.setViewportSize(size);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await settlePage(page);
  await driver(page);
}

/** axe's default rules on one part of the page, as `rule: element` lines. `region` is left out: a popup is portalled to <body>, outside the landmarks (#157). */
async function axeOn(page: Page, selector: string): Promise<string[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (context) => {
    type Run = (context: string, options: object) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }>;
    const result = await (window as unknown as { axe: { run: Run } }).axe.run(context, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html.slice(0, 80)).join(' | ')}`);
  }, selector);
}

/** How far a box reaches past the window, and whether the page scrolls sideways. */
async function inWindow(page: Page, box: Locator): Promise<{ outside: string[]; sideways: boolean }> {
  return box.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const outside: string[] = [];
    if (rect.left < 0) outside.push(`left ${rect.left}`);
    if (rect.top < 0) outside.push(`top ${rect.top}`);
    if (rect.right > window.innerWidth) outside.push(`right ${rect.right} > ${window.innerWidth}`);
    if (rect.bottom > window.innerHeight) outside.push(`bottom ${rect.bottom} > ${window.innerHeight}`);
    return { outside, sideways: document.documentElement.scrollWidth > window.innerWidth };
  });
}

/** True when every swatch of the open popup is what a press at its centre would reach: nothing is drawn over the popup. */
async function swatchesOnTop(popup: Locator): Promise<boolean> {
  return popup.evaluate((element) =>
    [...element.querySelectorAll('[role="radio"]')].every((radio) => {
      const rect = radio.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && radio.contains(hit);
    }),
  );
}

/** The colour boxes whose name is cut short, as `name (shown/needed px)`: each box shows a swatch, the colour's name and a caret. */
async function clippedNames(boxes: Locator): Promise<string[]> {
  return boxes.evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const name = button.querySelector('span.truncate')!;
      return name.scrollWidth > name.clientWidth ? [`${button.getAttribute('aria-label')} (${name.clientWidth}/${name.scrollWidth})`] : [];
    }),
  );
}

/** The picker and the hex box of a free colour field: their vertical centres and the hex box's width. */
async function pairOf(
  picker: Locator,
  hex: Locator,
): Promise<{ pickerMiddle: number; hexMiddle: number; pickerRight: number; hexLeft: number; hexWidth: number }> {
  const a = (await picker.boundingBox())!;
  const b = (await hex.boundingBox())!;
  return {
    pickerMiddle: Math.round(a.y + a.height / 2),
    hexMiddle: Math.round(b.y + b.height / 2),
    pickerRight: a.x + a.width,
    hexLeft: b.x,
    hexWidth: b.width,
  };
}

function expectOneLine(pair: Awaited<ReturnType<typeof pairOf>>): void {
  expect.soft(pair.hexMiddle, 'the hex box is on the picker’s line').toBe(pair.pickerMiddle);
  expect.soft(pair.hexLeft, 'the hex box starts after the picker').toBeGreaterThan(pair.pickerRight);
  expect.soft(pair.hexWidth, 'the hex box has room for six digits').toBeGreaterThanOrEqual(MIN_CONTROL_WIDTH_PX);
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    const at = `${size.width}, ${theme}`;

    test(`Settings, Entry types at ${at}: the colour box is inside its type and its swatches inside the window`, async ({ page }) => {
      await open(page, size, theme, settingsDrivers['project-type-colour']);
      const trigger = page.getByRole('button', { name: /^Colour for Place: / });
      const fits = await trigger.evaluate((button) => {
        const own = button.getBoundingClientRect();
        const type = button.closest('li')!.getBoundingClientRect();
        return own.left >= type.left && own.right <= type.right && own.top >= type.top && own.bottom <= type.bottom;
      });
      expect.soft(fits, 'the box is inside its type').toBe(true);
      expect.soft(await clippedNames(page.getByRole('button', { name: /^Colour for .+: / })), 'every colour name is whole').toEqual([]);
      const popup = page.locator(POPUP);
      const placed = await inWindow(page, popup);
      expect.soft(placed.outside, 'the swatches are inside the window').toEqual([]);
      expect.soft(placed.sideways, 'the page does not scroll sideways').toBe(false);
      expect.soft(await swatchesOnTop(popup), 'nothing covers a swatch').toBe(true);
      expect.soft(await axeOn(page, POPUP)).toEqual([]);
      await expect(popup).toMatchAriaSnapshot(`
        - dialog "Colour for Place":
          - radiogroup "Colour for Place":
            - radio "Green"
            - radio "Blue" [checked]
            - radio "Violet"
            - radio "Amber"
            - radio "Teal"
            - radio "Rose"
      `);
    });

    test(`Script, Define how you mark up at ${at}: the swatches open over the dialog, and Escape closes them and not the dialog`, async ({ page }) => {
      await open(page, size, theme, scriptDrivers['define-marks-colour']);
      const dialog = page.getByRole('dialog', { name: 'Define how you mark up' });
      const popup = page.locator(POPUP);
      expect.soft(await clippedNames(dialog.getByRole('button', { name: /^Colour: / })), 'every colour name is whole').toEqual([]);
      const placed = await inWindow(page, popup);
      expect.soft(placed.outside, 'the swatches are inside the window').toEqual([]);
      expect.soft(placed.sideways, 'the page does not scroll sideways').toBe(false);
      expect.soft(await swatchesOnTop(popup), 'the swatches are over the dialog').toBe(true);
      expect.soft(await axeOn(page, POPUP)).toEqual([]);
      await expect(popup).toMatchAriaSnapshot(`
        - dialog "Colour":
          - radiogroup "Colour":
            - radio "Copper" [checked]
            - radio "Blue"
            - radio "Green"
            - radio "Amber"
            - radio "Red"
            - radio "Violet"
      `);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Colour: / }).first()).toBeFocused();
    });

    test(`Story Bible, an entry in Edit at ${at}: the speaker colours stay inside the editor`, async ({ page }) => {
      await open(page, size, theme, storybibleDrivers['entry-editing']);
      const group = page.getByRole('radiogroup', { name: 'Speaker colour' });
      await group.scrollIntoViewIfNeeded();
      const row = await group.evaluate((element) => {
        const editor = element.closest('section')!.getBoundingClientRect();
        const swatches = [...element.querySelectorAll('[role="radio"]')].map((radio) => radio.getBoundingClientRect());
        return {
          count: swatches.length,
          outside: swatches.filter((rect) => rect.left < editor.left || rect.right > editor.right).length,
          smallest: Math.min(...swatches.map((rect) => Math.min(rect.width, rect.height))),
          sideways: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect.soft(row.count, 'Automatic and the seven hues').toBe(8);
      expect.soft(row.outside, 'no swatch is outside the editor').toBe(0);
      expect.soft(row.smallest, 'each swatch is a press target of 24 px or more').toBeGreaterThanOrEqual(24);
      expect.soft(row.sideways, 'the page does not scroll sideways').toBe(false);
      await group.evaluate((element) => element.setAttribute('data-colour-field-probe', ''));
      expect.soft(await axeOn(page, '[data-colour-field-probe]')).toEqual([]);
    });

    test(`Proof, Compare options at ${at}: each marker colour is a picker and a hex box on one line`, async ({ page }) => {
      await open(page, size, theme, proofChapterDrivers['options-open']);
      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Misread marker hex', exact: true }) });
      const hex = dialog.getByRole('textbox', { name: 'Misread marker hex', exact: true });
      await hex.scrollIntoViewIfNeeded();
      expectOneLine(await pairOf(dialog.getByLabel('Misread marker colour', { exact: true }), hex));
      await hex.evaluate((element) => element.parentElement!.setAttribute('data-colour-field-probe', ''));
      expect.soft(await axeOn(page, '[data-colour-field-probe]')).toEqual([]);
    });

    test(`Settings, Note colour at ${at}: a picker and a hex box on one line`, async ({ page }) => {
      await open(page, size, theme, async (settings) => {
        await openSettings(settings, 'Appearance & keys');
        await showSettingsRow(settings, 'look.note');
      });
      const row = page.locator('[data-row="look.note"]');
      const hex = row.getByRole('textbox', { name: /^Note hex/ });
      expectOneLine(await pairOf(row.getByLabel(/^Note colour/).first(), hex));
      expect.soft((await inWindow(page, hex)).sideways, 'the page does not scroll sideways').toBe(false);
      expect.soft(await axeOn(page, '[data-row="look.note"]')).toEqual([]);
    });

    test(`Settings, Compare defaults at ${at}: each marker colour is a picker and a hex box on one line`, async ({ page }) => {
      await open(page, size, theme, async (settings) => {
        await openSettings(settings, 'Set on a page');
        await settings.locator('[data-page-setting="ps.compare"]').getByRole('button', { name: 'Change it here for now' }).click();
      });
      const panel = page.locator('[data-page-setting="ps.compare"]');
      for (const marker of ['Misread', 'Skipped', 'Extra']) {
        const hex = panel.getByRole('textbox', { name: `${marker} marker hex`, exact: true });
        await hex.scrollIntoViewIfNeeded();
        expectOneLine(await pairOf(panel.getByLabel(`${marker} marker colour`, { exact: true }), hex));
      }
      expect.soft((await inWindow(page, panel)).sideways, 'the page does not scroll sideways').toBe(false);
      expect.soft(await axeOn(page, '[data-page-setting="ps.compare"]')).toEqual([]);
    });
  }
}
