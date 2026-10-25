import { expect, test, type Page } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';

// Proof's head, chapter strip, waveform and loading frame, measured (alignment audit XPF-3, XPF-10, XPF-11, XPF-15, R3PF-1, R3PF-5, R3PF-6).

async function drive(page: Page, size: { width: number; height: number }, state: string): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofDrivers[state](page);
}

test('Proof / the progress ring keeps its hole inside the ring', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'default');
  const mask = await page.locator('[data-ring]').evaluate((ring) => getComputedStyle(ring).maskImage || getComputedStyle(ring).webkitMaskImage);
  expect(mask, 'the hole is sized to the ring, not to its corners').toContain('closest-side');
});

test('Proof / at 390 the chapter tiles keep a press target and their labels inside them, and the strip says it scrolls', async ({ page }) => {
  await drive(page, { width: 390, height: 844 }, 'default');
  const strip = page.getByRole('group', { name: 'Open notes by chapter' });
  for (const tile of await strip.getByRole('button').all()) {
    const fit = await tile.evaluate((element) => ({ width: element.getBoundingClientRect().width, spill: element.scrollWidth - element.clientWidth }));
    expect(fit.width, 'a tile is at least 28 px wide').toBeGreaterThanOrEqual(28);
    expect(fit.spill, 'nothing spills out of a tile').toBeLessThanOrEqual(0);
  }
  const box = await strip.evaluate((element) => {
    const scroller = element.parentElement!;
    return { more: scroller.scrollWidth > scroller.clientWidth, cue: getComputedStyle(scroller).backgroundImage };
  });
  if (box.more) expect(box.cue).toContain('gradient');
});

test('Proof / the waveform pins are 24 px targets on one line, inside the track', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'chapter');
  const track = (await page.getByRole('group', { name: /^Chapter waveform/ }).boundingBox())!;
  const centres = new Set<number>();
  for (const pin of await page.locator('[data-pin], [data-cluster]').all()) {
    const box = (await pin.boundingBox())!;
    expect(box.width, 'a pin is a 24 px target').toBeGreaterThanOrEqual(24);
    expect(box.x, 'the pin starts inside the track').toBeGreaterThanOrEqual(track.x - 0.5);
    expect(box.x + box.width, 'the pin ends inside the track').toBeLessThanOrEqual(track.x + track.width + 0.5);
    centres.add(Math.round(box.y + box.height / 2));
  }
  expect(centres.size, 'the pins share a centre line').toBe(1);
  for (const edge of await page.locator('[data-edge]').all()) {
    const box = (await edge.boundingBox())!;
    expect(box.x, 'a window handle starts inside the track').toBeGreaterThanOrEqual(track.x - 0.5);
  }
});

test('Proof / the playing take is drawn once and every other take is named', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'takes-lanes');
  await expect(page.getByText(/^Take \d+ · (Kept|Active)$/)).toHaveCount(1);
  for (const lane of await page.locator('[data-lane]').all()) expect((await lane.innerText()).trim(), 'a lane says which take it is').toMatch(/^Take \d+$/);
});

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Proof / the loading frame is the page's three cards at their own heights / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'loading');
    const cards = page.locator('main .rounded-\\[var\\(--radius-card\\)\\]');
    await expect(cards).toHaveCount(3);
    if (size.width < 1180) {
      const [a, b] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
      expect(b.y - (a.y + a.height), 'cards keep the 16 px gap').toBeLessThanOrEqual(17);
    }
  });
}
