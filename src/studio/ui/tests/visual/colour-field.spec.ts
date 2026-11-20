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
const HINT = '[data-hint-popup]';
const PICKER = 'input[type="color"]';
// Longer than any double-click interval a system is likely set to (Windows' default is 500 ms): a second press this late is a new click.
const SLOW_SECOND_PRESS_MS = 600;

/** The two places a colour box opens its swatches over other controls: what opens the page, the list the boxes are in, and the boxes. */
const POPOVER_SITES = [
  {
    site: 'Settings, Entry types',
    driver: settingsDrivers['project-type-colour'],
    boxes: (page: Page) => page.getByRole('button', { name: /^Colour for .+: / }),
    list: (page: Page) => page.locator('[data-row="project.types"]'),
  },
  {
    site: 'Script, Define how you mark up',
    driver: scriptDrivers['define-marks-colour'],
    boxes: (page: Page) => page.getByRole('dialog', { name: 'Define how you mark up' }).getByRole('button', { name: /^Colour: / }),
    list: (page: Page) => page.getByRole('dialog', { name: 'Define how you mark up' }),
  },
];
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

/**
 * How each colour box draws its colour's name. A box shows a swatch, the name and a caret; a box with no room for the whole name shows the
 * swatch and the caret alone. `cut` lists the names drawn in part (never right), `hidden` the names not drawn at all.
 */
async function drawnNames(boxes: Locator): Promise<{ cut: string[]; hidden: string[] }> {
  return boxes.evaluateAll((buttons) => {
    const cut: string[] = [];
    const hidden: string[] = [];
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      // The room for the swatch and the name: inside the border (what is past it is not drawn), and clear of the caret at the right.
      const inner = {
        left: box.left + button.clientLeft + parseFloat(style.paddingLeft),
        right: box.left + button.clientLeft + button.clientWidth - parseFloat(style.paddingRight),
        top: box.top + button.clientTop,
        bottom: box.top + button.clientTop + button.clientHeight,
      };
      const name = button.lastElementChild!.getBoundingClientRect();
      const said = `${button.getAttribute('aria-label')} (box ${Math.round(box.width)} px, name ${Math.round(name.width)} px)`;
      const whole = name.left >= inner.left - 0.5 && name.right <= inner.right + 0.5 && name.top >= inner.top - 0.5 && name.bottom <= inner.bottom + 0.5;
      const out = name.top >= inner.bottom - 0.5 || name.left >= inner.right - 0.5;
      if (whole) continue;
      (out ? hidden : cut).push(said);
    }
    return { cut, hidden };
  });
}

/**
 * Every control inside `container`, as one line each: what it is, its name, its value and whether it is checked. A press that lands on the
 * wrong control changes a line that is not the colour box's, or the number of lines.
 */
async function controlsOf(container: Locator): Promise<string[]> {
  return container.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('button, input, select, [role="checkbox"], [role="switch"]')].map((control) =>
      [
        control.tagName.toLowerCase(),
        control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
        (control as HTMLInputElement).value ?? '',
        control.getAttribute('aria-checked') ?? '',
      ].join('|'),
    ),
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
      expect.soft(await drawnNames(page.getByRole('button', { name: /^Colour for .+: / })), 'every colour name is whole').toEqual({ cut: [], hidden: [] });
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
      expect.soft(await drawnNames(dialog.getByRole('button', { name: /^Colour: / })), 'every colour name is whole').toEqual({ cut: [], hidden: [] });
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
      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Misread marker color hex', exact: true }) });
      const hex = dialog.getByRole('textbox', { name: 'Misread marker color hex', exact: true });
      await hex.scrollIntoViewIfNeeded();
      expectOneLine(await pairOf(dialog.getByLabel('Misread marker color', { exact: true }).and(page.locator(PICKER)), hex));
      await hex.evaluate((element) => element.parentElement!.setAttribute('data-colour-field-probe', ''));
      expect.soft(await axeOn(page, '[data-colour-field-probe]')).toEqual([]);
    });

    test(`Settings, Note colour at ${at}: a picker and a hex box on one line`, async ({ page }) => {
      await open(page, size, theme, async (settings) => {
        await openSettings(settings, 'Appearance & keys');
        await showSettingsRow(settings, 'look.note');
      });
      const row = page.locator('[data-row="look.note"]');
      const hex = row.getByRole('textbox', { name: /^Note colour.* hex$/ });
      expectOneLine(await pairOf(row.locator(PICKER), hex));
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
        const hex = panel.getByRole('textbox', { name: `${marker} marker color hex`, exact: true });
        await hex.scrollIntoViewIfNeeded();
        expectOneLine(await pairOf(panel.getByLabel(`${marker} marker color`, { exact: true }).and(page.locator(PICKER)), hex));
      }
      expect.soft((await inWindow(page, panel)).sideways, 'the page does not scroll sideways').toBe(false);
      expect.soft(await axeOn(page, '[data-page-setting="ps.compare"]')).toEqual([]);
    });
  }
}

// B9 (#3680): a box with no room for its colour's whole name draws the swatch and the caret alone, never half a word; the name is then in
// the box's hint and in its accessible name.
for (const { site, driver, boxes, list } of POPOVER_SITES) {
  test(`${site} at 320: no colour name is cut, and a box without its name says it in a hint`, async ({ page }) => {
    await open(page, { width: 320, height: 844 }, 'light', driver);
    await page.keyboard.press('Escape');
    await expect(page.locator(POPUP)).toHaveCount(0);
    if (process.env.COLOUR_FIELD_SHOTS) await page.screenshot({ path: `${process.env.COLOUR_FIELD_SHOTS}/${site.replace(/\W+/g, '-')}-320.png` });
    const drawn = await drawnNames(boxes(page));
    expect.soft(drawn.cut, 'no colour name is drawn in part').toEqual([]);
    // A box that kept the width of its name would push the row's last control (Remove) past the window.
    const pastTheWindow = await list(page).evaluate((element) =>
      [...element.querySelectorAll('button')]
        .filter((button) => button.getBoundingClientRect().right > window.innerWidth + 0.5)
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    );
    expect.soft(pastTheWindow, 'every control of the list is inside the window').toEqual([]);
    // Escape put focus on the box that was open, and a focused box shows its hint.
    const box = boxes(page).and(page.locator(':focus'));
    await expect(box).toHaveCount(1);
    const name = ((await box.getAttribute('aria-label')) ?? '').split(': ').pop()!;
    expect(name).not.toBe('');
    expect
      .soft(
        drawn.hidden.some((said) => said.includes(`: ${name} (`)),
        'this box draws no name at 320',
      )
      .toBe(true);
    await expect(page.locator(HINT)).toHaveText(name);
    expect.soft(await box.getAttribute('title'), 'the hint is not a native title').toBeNull();
  });
}

// B4 (#3680): keyboard focus on the checked swatch shows its hint, and the first Escape used to dismiss only the hint.
for (const { site, driver, boxes } of POPOVER_SITES) {
  test(`${site}: opened with Enter, one Escape closes the swatches and focus is on the box`, async ({ page }) => {
    await open(page, SIZES[0]!, 'light', driver);
    await page.keyboard.press('Escape');
    const popup = page.locator(POPUP);
    await expect(popup).toHaveCount(0);
    const box = boxes(page).and(page.locator(':focus'));
    await expect(box).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(popup.getByRole('radio', { checked: true })).toBeFocused();
    await expect(page.locator(HINT)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(box).toHaveCount(1);
    // The Escape went no further: the dialog the box sits in (Define how you mark up) is still open, and Settings is still on its page.
    await expect(boxes(page).first()).toBeVisible();
  });
}

// B1, R1 (#3680): a press on a swatch used to pick and close the swatches, and the second press of a double click, or any press that followed
// on the same spot, landed on what they covered: it removed the next mark type at 320 wide and flipped the next entry type's "Can speak". A
// pointer press now only picks, and the swatches stay until Escape, Tab or a press outside. With the page's motion stilled and with the app's own.
const DOUBLE_CLICK_RUNS = [
  { width: 320, motion: false },
  { width: 390, motion: false },
  { width: 720, motion: false },
  { width: 1440, motion: false },
  { width: 320, motion: true },
  { width: 390, motion: true },
  { width: 720, motion: true },
  { width: 1440, motion: true },
];
/** The ways a narrator presses a swatch more than once, taken in turn down the swatches. */
const REPEATED_PRESSES = [
  { how: 'double click', press: (swatch: Locator) => swatch.dblclick() },
  { how: 'triple click', press: (swatch: Locator) => swatch.click({ clickCount: 3 }) },
  {
    how: 'slow second click',
    press: async (swatch: Locator) => {
      await swatch.click();
      await swatch.page().waitForTimeout(SLOW_SECOND_PRESS_MS);
      await swatch.click();
    },
  },
];

async function openSite(page: Page, width: number, motion: boolean, driver: ((page: Page) => Promise<void>) | undefined): Promise<void> {
  if (!driver) throw new Error('colour-field.spec.ts names a driver that tests/visual/drivers no longer has');
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  if (motion) await page.waitForLoadState('networkidle');
  else await settlePage(page);
  await driver(page);
}

/** What changed in the list besides the colour box at `boxAt`, and whether anything else opened: empty when the presses reached only the swatches. */
function strayChanges(before: string[], after: string[], boxAt: number | undefined, opened: number): string[] {
  const changed = after.flatMap((line, at) => (line !== before[at] && at !== boxAt ? [`${before[at]} => ${line}`] : []));
  if (after.length === before.length && changed.length === 0 && opened === 0) return [];
  return [`${before.length} => ${after.length} controls, opened ${opened}, ${changed.join('; ')}`];
}
const colourBoxAt = (controls: string[], row: number): number | undefined =>
  // Rows may share a colour, so the box is found by its place among the colour boxes, not by its name.
  controls.flatMap((line, at) => (/^button\|Colour[^|]*: /.test(line) ? [at] : []))[row];
const otherLayers = async (page: Page): Promise<number> => (await page.getByRole('alertdialog').count()) + (await page.getByRole('listbox').count());

for (const { site, driver, boxes, list } of POPOVER_SITES) {
  for (const { width, motion } of DOUBLE_CLICK_RUNS) {
    test(`${site} at ${width}${motion ? ', with motion' : ''}: a double, triple or slow second click on any swatch only picks it again`, async ({ page }) => {
      test.setTimeout(240_000);
      await openSite(page, width, motion, driver);
      const popup = page.locator(POPUP);
      const swatches = await popup.getByRole('radio').evaluateAll((radios) => radios.map((radio) => radio.getAttribute('aria-label') ?? ''));
      expect(swatches.length).toBeGreaterThanOrEqual(6);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      const rows = await boxes(page).count();
      expect(rows).toBeGreaterThanOrEqual(2);
      const wrong: string[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (const [nth, swatch] of swatches.entries()) {
          const { how, press } = REPEATED_PRESSES[(row + nth) % REPEATED_PRESSES.length]!;
          const before = await controlsOf(list(page));
          await boxes(page).nth(row).click();
          const radio = popup.getByRole('radio', { name: swatch, exact: true });
          await press(radio);
          // The swatches are still there, so no press had anything else to land on.
          await expect(popup, `${how} on ${swatch} leaves the swatches open`).toHaveCount(1);
          await expect(radio).toBeChecked();
          await page.keyboard.press('Escape');
          await expect(popup).toHaveCount(0);
          await expect(boxes(page).nth(row)).toHaveAttribute('aria-label', new RegExp(`: ${swatch}$`));
          await expect(boxes(page).nth(row)).toBeFocused();
          const after = await controlsOf(list(page));
          wrong.push(
            ...strayChanges(before, after, colourBoxAt(before, row), await otherLayers(page)).map((what) => `row ${row}, ${how} on ${swatch}: ${what}`),
          );
        }
      }
      expect(wrong).toEqual([]);
    });
  }
}

// R1 (#3680): the second press a little off the swatch (a hand that moves between the two presses) removed the next mark type at 320.
const OFF_SWATCH_RUNS = [
  { site: 'Script, Define how you mark up', width: 320 },
  { site: 'Script, Define how you mark up', width: 390 },
  { site: 'Settings, Entry types', width: 720 },
  { site: 'Settings, Entry types', width: 1440 },
];
for (const { site, width } of OFF_SWATCH_RUNS) {
  const { driver, boxes, list } = POPOVER_SITES.find((entry) => entry.site === site)!;
  test(`${site} at ${width}: a second press 3 px off a swatch changes only that row`, async ({ page }) => {
    await openSite(page, width, false, driver);
    const popup = page.locator(POPUP);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    const rows = await boxes(page).count();
    const wrong: string[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (const edge of ['right', 'left', 'top', 'bottom'] as const) {
        const before = await controlsOf(list(page));
        await boxes(page).nth(row).click();
        const swatch = (await popup.getByRole('radio', { name: 'Violet', exact: true }).boundingBox())!;
        const middle = { x: swatch.x + swatch.width / 2, y: swatch.y + swatch.height / 2 };
        const inside = {
          right: { x: swatch.x + swatch.width - 1, y: middle.y },
          left: { x: swatch.x + 1, y: middle.y },
          top: { x: middle.x, y: swatch.y + 1 },
          bottom: { x: middle.x, y: swatch.y + swatch.height - 1 },
        }[edge];
        const outside = {
          right: { x: swatch.x + swatch.width + 3, y: middle.y },
          left: { x: swatch.x - 3, y: middle.y },
          top: { x: middle.x, y: swatch.y - 3 },
          bottom: { x: middle.x, y: swatch.y + swatch.height + 3 },
        }[edge];
        await page.mouse.click(inside.x, inside.y);
        await page.mouse.click(outside.x, outside.y, { clickCount: 2 });
        await page.waitForTimeout(SLOW_SECOND_PRESS_MS);
        await page.mouse.click(outside.x, outside.y);
        // Whatever the stray presses did among the swatches (nothing, or a pick of the one beside Violet), they reached nothing under them.
        await expect(popup, `${edge} edge leaves the swatches open`).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(popup).toHaveCount(0);
        const after = await controlsOf(list(page));
        wrong.push(...strayChanges(before, after, colourBoxAt(before, row), await otherLayers(page)).map((what) => `row ${row}, ${edge} edge: ${what}`));
      }
    }
    expect(wrong).toEqual([]);
  });
}

// The swatches now stay after a pointer pick, so the ways out are checked where they are used: Tab, and a press outside.
for (const { site, driver, boxes, list } of POPOVER_SITES) {
  test(`${site}: after a pick, Tab closes the swatches with focus on the box, and a press outside closes them`, async ({ page }) => {
    await openSite(page, 1440, false, driver);
    const popup = page.locator(POPUP);
    await popup.getByRole('radio', { name: 'Violet', exact: true }).click();
    await expect(popup).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(popup).toHaveCount(0);
    const box = boxes(page).and(page.locator(':focus'));
    await expect(box).toHaveAttribute('aria-label', /: Violet$/);
    const row = await boxes(page).evaluateAll((all) => all.indexOf(document.activeElement as HTMLElement));
    // The list's own top left corner is padding: a press there is outside the swatches and on no control (and inside the dialog, where there is one).
    const corner = (await list(page).boundingBox())!;
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(1);
    await popup.getByRole('radio', { name: 'Green', exact: true }).click();
    await expect(popup).toHaveCount(1);
    await page.mouse.click(corner.x + 3, corner.y + 3);
    await expect(popup).toHaveCount(0);
    await expect(boxes(page).nth(row)).toHaveAttribute('aria-label', /: Green$/);
  });
}

// R6 (#3680): at the refusal, with focus in the box, there was a red edge and no reason; the hint needed the pointer or a second visit.
const FREE_SITES = [
  {
    site: 'Proof, Compare options',
    driver: proofChapterDrivers['options-open'],
    hex: (page: Page) => page.getByRole('dialog').getByRole('textbox', { name: 'Misread marker color hex', exact: true }),
  },
  {
    site: 'Settings, Note colour',
    driver: async (page: Page) => {
      await openSettings(page, 'Appearance & keys');
      await showSettingsRow(page, 'look.note');
    },
    hex: (page: Page) => page.locator('[data-row="look.note"]').getByRole('textbox', { name: /^Note colour.* hex$/ }),
  },
  {
    site: 'Settings, Compare defaults',
    driver: async (page: Page) => {
      await openSettings(page, 'Set on a page');
      await page.locator('[data-page-setting="ps.compare"]').getByRole('button', { name: 'Change it here for now' }).click();
    },
    hex: (page: Page) => page.getByRole('textbox', { name: 'Misread marker color hex', exact: true }),
  },
];
for (const { site, driver, hex } of FREE_SITES) {
  for (const width of [1440, 320]) {
    test(`${site} at ${width}: a refused hex shows the hint with no pointer move`, async ({ page }) => {
      await open(page, { width, height: 844 }, 'light', driver);
      const box = hex(page).first();
      await box.scrollIntoViewIfNeeded();
      // The pointer rests in the page's corner throughout: only keys follow.
      await page.mouse.move(1, 1);
      await box.focus();
      const stored = await box.inputValue();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('B547');
      await expect(page.locator(HINT)).toHaveCount(0);
      await page.keyboard.press('Enter');
      const hint = page.locator(HINT);
      await expect(hint).toHaveText('Six hex digits, like B5473C');
      await expect(box).toBeFocused();
      await expect(box).toHaveAttribute('aria-invalid', 'true');
      expect.soft((await inWindow(page, hint)).outside, 'the hint is inside the window').toEqual([]);
      // One Escape takes the hint and the refused text away, and closes nothing the box sits in.
      await page.keyboard.press('Escape');
      await expect(hint).toHaveCount(0);
      await expect(box).toHaveValue(stored);
      await expect(box).not.toHaveAttribute('aria-invalid', 'true');
      await expect(box).toBeVisible();
    });
  }
}
