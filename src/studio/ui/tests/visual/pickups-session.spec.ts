import { expect, test, type Page } from '@playwright/test';
import { pickupsDrivers } from './drivers/pickups';
import { settlePage } from './helpers/settle';

// The Pickups page grid and its Pickup session card (alignment audit, #2251), measured in the real app: side by side the two cards end
// at one bottom edge in every state (XPK-6, R4TB-7) and the side column is Proof's 380 px (XPK-18); the markers button sits beside
// Open in Booth (XPK-4); stacked, the session card keeps its own width instead of stretching across the window (XPK-4).
async function open(page: Page, state: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await pickupsDrivers[state]!(page);
}

const cards = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => el!.getBoundingClientRect();
    const table = box(document.querySelector('section[aria-label="Pickups"]'));
    const panel = [...document.querySelectorAll('section')].find((section) => section.querySelector('h2')?.textContent === 'Pickup session')!;
    const booth = [...panel.querySelectorAll('button')].find((button) => /in Booth$/.test(button.textContent ?? ''))!;
    const markers = panel.querySelector('button[aria-label*="as markers in"]')!;
    return {
      tableBottom: Math.round(table.bottom),
      sessionBottom: Math.round(box(panel).bottom),
      sessionWidth: Math.round(box(panel).width),
      boothTop: Math.round(box(booth).top),
      markersTop: Math.round(box(markers).top),
    };
  });

test('Pickups / side by side, the two cards share a bottom edge in every state and the side column is 380 px / desktop', async ({ page }) => {
  for (const state of ['list', 'scoped', 'empty', 'unreadable', 'loading']) {
    await open(page, state, 1440, 900);
    const seen = await cards(page);
    expect(seen.tableBottom, `${state}: the cards end together`).toBe(seen.sessionBottom);
    expect(seen.sessionWidth, `${state}: Proof's side column width`).toBe(380);
    expect(seen.markersTop, `${state}: the markers button is beside Open in Booth`).toBe(seen.boothTop);
  }
});

test('Pickups / stacked, the session card keeps its own width / small-desktop', async ({ page }) => {
  await open(page, 'list', 1024, 768);
  const seen = await cards(page);
  expect(seen.sessionWidth, 'no wider than 30 rem').toBeLessThanOrEqual(480);
});
