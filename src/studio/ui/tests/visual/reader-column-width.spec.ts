// One column-width tool for the Script and the Booth (owner issue 4): the Reader text setting caps the column at its characters a line or
// its share of the container, so Narrow stays narrower than Full at every window width on both pages. Booth text is larger than the Script's,
// and used to fill a half-width window at Narrow.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { goToPage } from './drivers/shared';

const WIDTHS = [1920, 1100, 700];
const CHOICES = [
  ['Narrow', 48],
  ['Full', 100],
] as const;

async function choose(page: Page, width: number): Promise<void> {
  await page.addInitScript(
    (w) => window.localStorage.setItem('narration.script.text', JSON.stringify({ font: 'Georgia', size: 20, spacing: 1.7, width: w })),
    width,
  );
}

type Page2 = 'script' | 'booth';
async function open(page: Page, which: Page2): Promise<void> {
  if (which === 'booth') await boothDrivers['setup']!(page);
  else {
    await page.goto('/');
    await goToPage(page, 'Script');
  }
}

async function column(page: Page, which: Page2): Promise<{ column: number; container: number }> {
  return page.evaluate((w) => {
    const el = document.querySelector(w === 'booth' ? '[data-booth-text] > div' : '[data-reader]')!;
    const parent = el.parentElement!;
    const style = getComputedStyle(parent);
    const inner = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { column: el.getBoundingClientRect().width, container: inner };
  }, which);
}

for (const which of ['script', 'booth'] as const) {
  for (const width of WIDTHS) {
    test(`${which} at ${width}: Narrow is narrower than Full and neither exceeds its container`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const measured: Record<string, { column: number; container: number }> = {};
      for (const [name, value] of CHOICES) {
        const fresh = await page.context().newPage();
        await fresh.setViewportSize({ width, height: 900 });
        await choose(fresh, value);
        await open(fresh, which);
        measured[name] = await column(fresh, which);
        await fresh.close();
      }
      const { Narrow, Full } = measured as Record<'Narrow' | 'Full', { column: number; container: number }>;
      expect(Narrow.column, 'Narrow is narrower than Full').toBeLessThan(Full.column);
      expect(Narrow.column).toBeLessThanOrEqual(Narrow.container + 1);
      expect(Full.column).toBeLessThanOrEqual(Full.container + 1);
      // Narrow takes under half the container's room again whenever the container is the cap (a half-width window).
      expect(Narrow.column / Narrow.container, 'Narrow leaves room beside it').toBeLessThanOrEqual(0.5);
    });
  }
}
