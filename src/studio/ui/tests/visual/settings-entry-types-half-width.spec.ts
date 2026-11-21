// Settings > Project > Entry types at a half-width window (#3674): the row's body sits under its label across the whole row, so each type
// (its name box, its colour box and Remove) is one line, and the colour box shows the colour's name. At 960 and 1100 px the row used to give
// the body about 280 px beside the label, so every type wrapped to two lines and the colour box showed a swatch and a caret.
import { expect, test, type Page } from '@playwright/test';
import { settingsDrivers } from './drivers/settings';
import { settlePage } from './helpers/settle';

const WIDTHS = [960, 1100];
const THEMES = ['light', 'dark'] as const;

async function openEntryTypes(page: Page, width: number, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await settlePage(page);
  const driver = settingsDrivers['project-type-colour'];
  if (!driver) throw new Error('settings-entry-types-half-width.spec.ts names a driver that tests/visual/drivers no longer has');
  await driver(page);
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`Settings, Entry types at ${width} px, ${theme}: the list takes the row's width and each type is one line`, async ({ page }) => {
      await openEntryTypes(page, width, theme);
      const row = page.locator('[data-row="project.types"]');
      const measured = await row.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const label = element.querySelector('label, h3, [id$="-label"]')?.getBoundingClientRect() ?? rect;
        const list = element.querySelector('ul, ol')!.getBoundingClientRect();
        const types = Array.from(element.querySelectorAll('li')).map((item) => {
          const box = item.getBoundingClientRect();
          return { height: box.height };
        });
        const colour = element.querySelector('button[aria-label^="Colour for "]')?.getBoundingClientRect();
        return { row: rect.width, labelLeft: label.left, listLeft: list.left, listWidth: list.width, types, colourWidth: colour?.width ?? 0 };
      });
      expect.soft(Math.abs(measured.listLeft - measured.labelLeft), 'the list starts at the label’s left edge').toBeLessThan(24);
      expect.soft(measured.listWidth, 'the list takes the row’s width').toBeGreaterThan(measured.row * 0.85);
      for (const [index, type] of measured.types.entries()) expect.soft(type.height, `type ${index + 1} is one line`).toBeLessThan(44);
      expect.soft(measured.colourWidth, 'the colour box is wide enough to show the colour’s name').toBeGreaterThanOrEqual(120);
    });
  }
}
