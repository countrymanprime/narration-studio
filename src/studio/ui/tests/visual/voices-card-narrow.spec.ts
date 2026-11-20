// The Voices card's table keeps a readable Track column in a small window, in the Engine panel and in Settings (#3331): its fixed-width columns (Key, Counts as
// voice, the edit button) must leave the Track and Characters columns room, so a name is not one letter per line and no header prints over another.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { openEnginePanel, openSettings, showSettingsRow } from './drivers/shared';

const table = (scope: Page | Locator) => scope.getByRole('table', { name: /^Voices of / });

/** What the table draws: the Track column's width, the tallest row, and whether any two headers overlap. */
async function measure(box: Locator) {
  return box.evaluate((el) => {
    const headers = [...el.querySelectorAll('th')].map((th) => th.getBoundingClientRect());
    const overlap = headers.some((a, i) =>
      headers.slice(i + 1).some((b) => a.width > 0 && b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom && b.top < a.bottom),
    );
    const track = [...el.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[1]?.getBoundingClientRect().width ?? 0);
    const rows = [...el.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect().height);
    return { overlap, trackMin: Math.min(...track), tallest: Math.max(...rows), wide: el.scrollWidth > el.clientWidth + 1 };
  });
}

for (const { width, height } of [
  { width: 360, height: 500 },
  { width: 320, height: 300 },
]) {
  test(`${width}x${height}: the Voices table keeps a readable Track column in the Engine panel`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    const panel = await openEnginePanel(page);
    const voices = table(panel);
    await voices.getByRole('row', { name: /Extras/ }).waitFor();
    const m = await measure(voices);
    expect(m.overlap).toBe(false);
    expect(m.trackMin).toBeGreaterThanOrEqual(width < 340 ? 48 : 56);
    expect(m.tallest).toBeLessThan(110);
    expect(m.wide).toBe(false);
  });

  test(`${width}x${height}: the Voices table keeps a readable Track column in Settings`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSettings(page, 'Recording & DAW', '?mockVoiceFolders=1');
    const row = await showSettingsRow(page, 'daw.voices');
    const voices = table(row);
    await voices.getByRole('row', { name: /Extras/ }).waitFor();
    const m = await measure(voices);
    expect(m.overlap).toBe(false);
    expect(m.trackMin).toBeGreaterThanOrEqual(width < 340 ? 48 : 56);
    expect(m.tallest).toBeLessThan(110);
    expect(m.wide).toBe(false);
  });
}
