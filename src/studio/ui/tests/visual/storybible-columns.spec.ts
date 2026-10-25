import { expect, test, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// Down an entry, Properties' Value and Relationships' To start at one x, and do not move when Edit is pressed (alignment audit SBX-5,
// SBX-10: 858, 1069 and 1159 px at 1440); in edit view a relationship's Remove sits right after its picker (SBX-10: 71-90 px of nothing).
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
// Alice: two properties and five relationships, read (category-all) and in edit (relationship-picker's entry, picker closed).
const STATES = [
  { state: 'category-all', editing: false },
  { state: 'name-clash', editing: true },
];
test.describe.configure({ timeout: 90_000 });

const headerX = async (page: Page, table: string, header: string) =>
  (await page.getByRole('table', { name: table }).getByRole('columnheader', { name: header, exact: true }).boundingBox())!.x;

for (const { state, editing } of STATES) {
  for (const size of SIZES) {
    test(`Story Bible / Properties and Relationships share their value column / ${state} / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      page.setDefaultTimeout(20_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await settlePage(page);
      await storybibleDrivers[state](page);
      await page.getByRole('table', { name: 'Relationships' }).scrollIntoViewIfNeeded();
      const value = await headerX(page, 'Properties', 'Value');
      const to = await headerX(page, 'Relationships', 'To');
      expect(Math.abs(value - to), 'Value and To start at one x').toBeLessThanOrEqual(1);
      if (editing) {
        const row = page.getByRole('table', { name: 'Relationships' }).getByRole('row').nth(1);
        const picker = (await row.getByRole('button', { name: /^To: / }).boundingBox())!;
        const remove = (await row.getByRole('button', { name: 'Remove relationship' }).boundingBox())!;
        expect(remove.x - (picker.x + picker.width), 'Remove sits right after the picker').toBeLessThanOrEqual(12);
      }
    });
  }
}
