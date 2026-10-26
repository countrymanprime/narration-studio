import { expect, test, type Page } from '@playwright/test';
import { editingDrivers } from './drivers/editing';
import { settlePage } from './helpers/settle';

// The drawer's Clean up tab draws its controls in one column at its right edge (the found rows' Review, the audio's Apply). The retry bar's
// Stack/Leave toggle ends there too, not wherever its label's text ends: next to the label it ended 44 to 50 px short of the edge, by the
// font's width, so the alignment scan's A4 went red on one machine and not another (#2251).
async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await editingDrivers['drawer-cleanup']!(page);
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Editing / the drawer's retry toggle ends where the Clean up actions end / ${size.name}`, async ({ page }) => {
    await open(page, size.width, size.height);
    const edges = await page.locator('[data-retry-bar="chapter"]').evaluate((bar) => {
      const toggle = bar.querySelector('[role="group"]')!;
      const apply = [...document.querySelectorAll('#drawer button')].find((button) => /^Apply/.test(button.textContent ?? ''))!;
      return { bar: bar.getBoundingClientRect().right, toggle: toggle.getBoundingClientRect().right, apply: apply.getBoundingClientRect().right };
    });
    expect(Math.abs(edges.toggle - edges.bar), `the toggle ends at its row's end (${edges.toggle}, ${edges.bar})`).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.toggle - edges.apply), `the toggle ends where Apply ends (${edges.toggle}, ${edges.apply})`).toBeLessThanOrEqual(1);
  });
}
