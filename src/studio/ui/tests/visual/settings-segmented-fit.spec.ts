import { expect, test, type Locator, type Page } from '@playwright/test';
import { CATEGORIES } from '../../src/components/settings/registry/categories';
import { PAGE_FIELD_CONTROLS } from '../../src/components/settings/registry/choiceControls';
import { ROWS } from '../../src/components/settings/registry/rows';
import { openAdvanced, openSettings, showSettingsRow } from './drivers/shared';
import { settlePage } from './helpers/settle';

// A Settings choice drawn as a segmented group must fit its row on one line in a 960 px window (component-selection CS-E1, CS-E6): a group
// whose labels do not fit wraps onto a second line, and is then a `radio` or a `select` instead. `choiceControls.test.ts` holds each
// declaration to an option count and a label budget; this measures what jsdom cannot, the drawn group, for every row that declares
// `segmented`, with the row's Reset and Saved beside it and, where a project may override it, in the "This project uses" line too.
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
