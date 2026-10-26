import { expect, test } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// The selected file's checks and its every-rule list (alignment audit XMS-14, XMS-7, R4MS1-3, R4MS1-4): a label starts at the same x on a
// Pass row and a Fail row and stays near its value on a wide window; a rule's result pill never folds, and no column of the rule list
// becomes a tower of short lines or is cut at the card's edge.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Master / the checks and the rule list keep one grid / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['file-rules']!(page);
    const checks = page.getByRole('region', { name: /· Why it fails$/ });
    const rows = await checks.locator('li').evaluateAll((items) =>
      items.map((item) => {
        const [, label, value] = [...item.children].map((child) => child.getBoundingClientRect());
        return { label: Math.round(label!.left), gap: Math.round(value!.left - label!.left) };
      }),
    );
    expect(new Set(rows.map((row) => row.label)).size, 'every label starts at one x').toBe(1);
    for (const row of rows) expect(row.gap, 'a value stays within reach of its label').toBeLessThan(560);

    const rules = page.getByRole('table', { name: 'Chapter 01.wav, rule by rule' });
    const pills = await rules.locator('tbody td:first-child > *').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
    expect(Math.max(...pills), 'no result pill folds').toBeLessThanOrEqual(24);
    const scroll = await rules.evaluate((table) => ({ table: table.scrollWidth, box: table.parentElement!.clientWidth }));
    expect(scroll.table, 'the rule list fits its card').toBeLessThanOrEqual(scroll.box + 1);
    const tallest = await rules.locator('tbody tr').evaluateAll((trs) => Math.max(...trs.map((tr) => tr.getBoundingClientRect().height)));
    expect(tallest, 'no row is a tower of short lines').toBeLessThan(200);
  });
}

// Master to spec (XMS-1, XMS-8, R4MS2-5, R3MS-12, R3MS-13): a Title box wide enough to read, Status on one line, Remove ending at the
// header buttons' right edge, and Master & encode in the panel's header at every width.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Master / Master to spec keeps its controls readable and its edges / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['to-spec-picked']!(page);
    const panel = page.getByRole('region', { name: 'Master to spec' });
    const title = (await panel.getByRole('textbox').first().boundingBox())!;
    expect(title.width, 'a Title box can be read').toBeGreaterThanOrEqual(150);
    const add = (await panel.getByRole('button', { name: 'Add files…' }).boundingBox())!;
    const encode = (await panel.getByRole('button', { name: 'Master & encode' }).boundingBox())!;
    expect(Math.abs(encode.y - add.y), 'Master & encode sits in the header beside Add files…').toBeLessThanOrEqual(1);
    const remove = (await panel.getByRole('button', { name: 'Remove' }).first().boundingBox())!;
    expect(Math.abs(encode.x + encode.width - (remove.x + remove.width)), "Remove ends at the header's right edge").toBeLessThanOrEqual(1);
    const statuses = await panel.getByText('Not started').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
    expect(Math.max(...statuses), '"Not started" stays on one line').toBeLessThanOrEqual(24);
  });
}
