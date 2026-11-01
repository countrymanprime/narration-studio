// The owner: "why are the arrow buttons at the sides of the waveform so small compared to the waveform?" They were the dense-row 32 px icon
// button, centred beside a lane twice its height. The arrows that page the waveform are the lane's height and a 44 px target at every
// viewport, in both themes (IconButton `size="lane"`).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { VIEWPORTS } from './viewports';

const DOCK = '#wavedock';
const LANE = `${DOCK} [data-ribbon-surface]`;
const ARROWS = ['Scroll the waveform back', 'Scroll the waveform forward'];

async function openEditing(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  await page.locator(LANE).waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of VIEWPORTS) {
    test(`Editing: the waveform's arrows are the lane's height and a 44 px target (${theme}, ${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openEditing(page, theme);
      // The lane's box: the bordered frame around the canvas, the arrows' neighbour in the row.
      const lane = await page.locator(LANE).evaluate((el) => {
        const frame = el.closest('.rounded-md') ?? el;
        const r = frame.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });
      for (const name of ARROWS) {
        const box = await page.locator(DOCK).getByRole('button', { name }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(box!.height - lane.height), `${name} height against the lane's ${lane.height}`).toBeLessThanOrEqual(1);
        expect(Math.abs(box!.y - lane.top), `${name} top`).toBeLessThanOrEqual(1);
      }
    });
  }
}
