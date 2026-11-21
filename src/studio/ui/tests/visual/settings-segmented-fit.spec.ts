import { expect, test, type Locator, type Page } from '@playwright/test';
import { CATEGORIES } from '../../src/components/settings/registry/categories';
import { PAGE_FIELD_CONTROLS } from '../../src/components/settings/registry/choiceControls';
import { ROWS } from '../../src/components/settings/registry/rows';
import { openAdvanced, openSettings, showSettingsRow } from './drivers/shared';
import { settlePage } from './helpers/settle';

// A Settings choice drawn as a segmented group must fit its row on one line in a 960 px window (component-selection CS-E1, CS-E6): a group
// whose labels do not fit wraps onto a second line, and is then a `radio` or a `select` instead. `choiceControls.test.ts` holds each
// declaration to an option count and a label budget; this measures what jsdom cannot, the drawn group, for every row that declares
// `segmented`, with the row's Reset and Saved beside it and, where a project may override it, under "This project uses" too.
//
// The budget comes from this measurement. In a 960 px window a row's control line is 278 px (260 px in Advanced), and Reset (36 px), Saved
// (35 px) and their two 6 px gaps leave the group 195 px (177 px). Drawn on one line, Live model is 116 px and fits; Live engine (233 px),
// Compare chunk length (225 px) and Pronunciation source for new names (366 px) do not, so those three rows declare `radio`.
const SEGMENTED = ROWS.filter((row) => row.control === 'segmented');
// The "Set on a page" panels whose fields have no registry row and are declared segmented by tool (`PAGE_FIELD_CONTROLS`).
const SEGMENTED_PANELS = [
  { entry: 'ps.preview', tool: 'Preview' },
  { entry: 'ps.stages', tool: 'StageRecommendations' },
];
const categoryOf = (id: string): string => CATEGORIES.find((category) => category.id === id)!.label;

type Box = { x: number; y: number; width: number; height: number };

async function controlHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.height = 'var(--control-height)';
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

/** Every segmented group `within` draws now, each on one line and inside `card`, which pads its content 20 px. */
async function expectGroupsFit(page: Page, within: Locator, when: string, cardOf: Locator = within): Promise<void> {
  const oneLine = await controlHeight(page);
  const card: Box = (await cardOf.boundingBox())!;
  const groups = await within.getByRole('group').all();
  expect(groups.length, `${when}: a group is drawn`).toBeGreaterThan(0);
  for (const group of groups) {
    const name = await group.getAttribute('aria-label');
    const box: Box = (await group.boundingBox())!;
    expect(Math.abs(box.height - oneLine), `${when}: "${name}" is one line (${box.height} px against ${oneLine} px)`).toBeLessThanOrEqual(1);
    expect(box.x + box.width, `${when}: "${name}" ends inside its card, clear of the padding`).toBeLessThanOrEqual(card.x + card.width - 19);
    const tops = await group.getByRole('button').evaluateAll((segments) => segments.map((segment) => Math.round(segment.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${when}: every segment of "${name}" is on the same line`).toBe(1);
  }
}

test('there is a segmented Settings row to measure, and every tool declared segmented has its panel measured', () => {
  expect(SEGMENTED.length).toBeGreaterThan(0);
  const declared = Object.entries(PAGE_FIELD_CONTROLS)
    .filter(([, control]) => control === 'segmented')
    .map(([name]) => name.slice(0, name.indexOf('.')));
  expect(SEGMENTED_PANELS.map((panel) => panel.tool).sort()).toEqual(declared.sort());
});

for (const size of [
  { name: 'narrow-desktop', width: 960, height: 640 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  for (const meta of SEGMENTED) {
    test(`Settings / the segmented row ${meta.id} fits on one line / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await settlePage(page);
      await openSettings(page, categoryOf(meta.cat));
      if (meta.advanced) await openAdvanced(page);
      const row = await showSettingsRow(page, meta.id);
      await expectGroupsFit(page, row, 'as it opens');

      // Changed: the row gains Reset and, for a moment, Saved, both beside the group.
      await row.getByRole('group').first().getByRole('button', { pressed: false }).last().click();
      await row.getByRole('button', { name: /^Reset / }).waitFor();
      await row.getByText('Saved', { exact: true }).waitFor();
      await expectGroupsFit(page, row, 'changed, with Reset and Saved beside it');

      if (meta.scope !== 'both') return;
      await row.getByRole('button', { name: /^Override for this project/ }).click();
      await row.getByRole('button', { name: /^Use computer setting/ }).waitFor();
      await expect(row.getByRole('group')).toHaveCount(2);
      await expectGroupsFit(page, row, 'with this project’s own value under it');
    });
  }

  for (const panel of SEGMENTED_PANELS) {
    test(`Settings / the segmented choices of the ${panel.tool} panel fit on one line / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await settlePage(page);
      await openSettings(page, 'Set on a page');
      const entry = page.locator(`[data-page-setting="${panel.entry}"]`);
      await entry.getByRole('button', { name: 'Change it here for now' }).click();
      const form = entry.locator('form');
      await form.getByRole('group').first().waitFor();
      await expectGroupsFit(page, form, 'under Global', entry);

      // This project, with a value of its own: the field gains its Reset beside the group.
      await entry.getByRole('button', { name: 'This project', exact: true }).click();
      await form.getByRole('group').first().getByRole('button', { pressed: false }).last().click();
      await entry.getByRole('button', { name: 'Save', exact: true }).click();
      await form
        .getByRole('button', { name: /^Reset / })
        .first()
        .waitFor();
      await expectGroupsFit(page, form, 'under This project, with Reset beside the first', entry);
    });
  }
}

// A Reset beside a radio stack is level with the first option; centred against the stack it read as the middle option's (qa-breaker B13 on
// #3681). In a "Set on a page" panel every Reset ends at the same x, whatever control it is beside (ux-review 3 on #3681: the layout class had
// landed on the button inside its hint wrapper, where it moved nothing).
const centreY = (box: Box): number => box.y + box.height / 2;
const bottom = (box: Box): number => box.y + box.height;
const RADIO_ROWS = ROWS.filter((row) => row.control === 'radio');
const OVERRIDABLE_RADIO_ROWS = RADIO_ROWS.filter((row) => row.scope === 'both');

test('there is a radio Settings row to measure, and one a project may override', () => {
  expect(RADIO_ROWS.length).toBeGreaterThan(0);
  expect(OVERRIDABLE_RADIO_ROWS.length).toBeGreaterThan(0);
});

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow-desktop', width: 960, height: 640 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
]) {
  for (const meta of RADIO_ROWS) {
    test(`Settings / Reset lines up with the first option of the radio row ${meta.id} / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await settlePage(page);
      await openSettings(page, categoryOf(meta.cat));
      if (meta.advanced) await openAdvanced(page);
      const row = await showSettingsRow(page, meta.id);
      const radios = row.getByRole('radiogroup').first().getByRole('radio');
      await radios.and(row.locator('[aria-checked="false"]')).last().click();
      const reset = row.getByRole('button', { name: /^Reset / });
      await reset.waitFor();
      const first: Box = (await radios.first().boundingBox())!;
      const last: Box = (await radios.last().boundingBox())!;
      const button: Box = (await reset.boundingBox())!;
      expect(Math.abs(centreY(button) - centreY(first)), 'Reset is level with the first option').toBeLessThanOrEqual(2);
      expect(centreY(last) - centreY(first), 'the options are a stack, so level with the first is not level with the last').toBeGreaterThan(20);
      expect(button.x, 'Reset is beside the options, not over them').toBeGreaterThanOrEqual(first.x + first.width);
    });
  }

  // The computer's stack and the project's are two blocks: run on at one option's distance they read as one list of eight, and "This project uses"
  // and Use computer setting centred against the project's stack sat beside its middle options (ux-review 5 on #3681).
  for (const meta of OVERRIDABLE_RADIO_ROWS) {
    test(`Settings / the project’s options of the radio row ${meta.id} are a block of their own / ${size.name} ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await settlePage(page);
      await openSettings(page, categoryOf(meta.cat));
      if (meta.advanced) await openAdvanced(page);
      const row = await showSettingsRow(page, meta.id);
      await row.getByRole('button', { name: /^Override for this project/ }).click();
      const back = row.getByRole('button', { name: /^Use computer setting/ });
      await back.waitFor();
      await expect(row.getByRole('radiogroup')).toHaveCount(2);
      const boxesOf = async (group: Locator): Promise<Box[]> => {
        const boxes: Box[] = [];
        for (const radio of await group.getByRole('radio').all()) boxes.push((await radio.boundingBox())!);
        return boxes;
      };
      const computer = await boxesOf(row.getByRole('radiogroup').first());
      const project = await boxesOf(row.getByRole('radiogroup').last());
      const pitch = centreY(computer[1]) - centreY(computer[0]);
      expect(pitch, 'the options are a stack').toBeGreaterThan(20);
      const between = centreY(project[0]) - centreY(computer[computer.length - 1]);
      expect(between, `the two stacks are ${between} px apart, clearly more than the ${pitch} px between two options`).toBeGreaterThanOrEqual(pitch * 1.75);

      const words: Box = (await row.getByText('This project uses', { exact: true }).boundingBox())!;
      expect(words.y, 'the words are under the computer’s last option').toBeGreaterThanOrEqual(bottom(computer[computer.length - 1]));
      expect(bottom(words), 'the words are above the project’s first option').toBeLessThanOrEqual(project[0].y);
      expect(Math.abs(words.x - project[0].x), 'the words start where the options do').toBeLessThanOrEqual(1);
      const link: Box = (await back.boundingBox())!;
      expect(link.y, 'Use computer setting is under the last option, not beside one').toBeGreaterThanOrEqual(bottom(project[project.length - 1]));
      expect(Math.abs(link.x - project[0].x), 'Use computer setting starts where the options do').toBeLessThanOrEqual(1);
    });
  }

  test(`Settings / every Reset of the Compare defaults panel ends at one x, level with the first option beside radios / ${size.name} ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await openSettings(page, 'Set on a page');
    const entry = page.locator('[data-page-setting="ps.compare"]');
    await entry.getByRole('button', { name: 'Change it here for now' }).click();
    await entry.getByRole('button', { name: 'This project', exact: true }).click();
    const form = entry.locator('form');
    const radios = form.getByRole('radiogroup').first().getByRole('radio');
    await radios.and(form.locator('[aria-checked="false"]')).last().click();
    const hex = form.getByRole('textbox', { name: /hex$/ }).first();
    await hex.fill('AA0001');
    await hex.press('Tab');
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    const resets = form.getByRole('button', { name: /^Reset / });
    await expect(resets).toHaveCount(2);
    const boxes: Box[] = [];
    for (const reset of await resets.all()) boxes.push((await reset.boundingBox())!);
    expect(Math.abs(boxes[0].x - boxes[1].x), 'both Resets start at the same x').toBeLessThanOrEqual(1);
    const first: Box = (await radios.first().boundingBox())!;
    expect(Math.abs(centreY(boxes[0]) - centreY(first)), 'the Reset beside the radios is level with the first option').toBeLessThanOrEqual(2);
    const card: Box = (await entry.boundingBox())!;
    for (const box of boxes) expect(box.x + box.width, 'Reset ends inside the card').toBeLessThanOrEqual(card.x + card.width);
  });
}
