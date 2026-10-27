// The Booth's text column and side panel (#2251, alignment audit docs/research/alignment-audit/findings/booth.md): one gutter for the
// text and the bars, the ribbons and the pickup bar inside the window, a drawer that dims what it covers, and the side sections' columns.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const driver = boothDrivers[state];
  if (!driver) throw new Error(`no booth driver for ${state}`);
  await driver(page);
}

const NARROW = [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
];

// XBO-18: the text column is left-aligned at the page gutter at any width (the width control narrows it from the right), as the bars are.
for (const size of NARROW) {
  test(`setup at ${size.width}: the text starts at the page gutter`, async ({ page }) => {
    await drive(page, 'setup', size);
    const left = await page.evaluate(() => document.querySelector('[data-booth-text] > div')!.getBoundingClientRect().left);
    expect(left).toBe(16);
  });

  // XBO-18: the pickup line's bar stays inside the gutter, never at the window's edge.
  test(`pickup-session at ${size.width}: the pickup bar is inside the gutter`, async ({ page }) => {
    await drive(page, 'pickup-session', size);
    const bar = await page.evaluate(() => document.querySelector('[data-pickup]')!.getBoundingClientRect().left);
    expect(bar, 'the bar starts at the gutter').toBeGreaterThanOrEqual(16);
  });

  // XBO-24 (the Booth's side of it): the ribbon margin ends at the gutter, not at the window's edge.
  test(`bookmarks-ribbon at ${size.width}: the ribbon ends inside the gutter`, async ({ page }) => {
    await drive(page, 'bookmarks-ribbon', size);
    const right = await page.evaluate(() => document.querySelector('[data-bmk-margin] [data-bm]')!.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(size.width - 16);
  });

  // XBO-19: the drawer dims the text it covers, so a word cut at its edge reads as behind it.
  test(`voice-samples-panel at ${size.width}: the drawer dims the text beside it`, async ({ page }) => {
    await drive(page, 'voice-samples-panel', size);
    const g = await page.evaluate(() => {
      const panel = document.getElementById('booth-side')!.getBoundingClientRect();
      const text = document.querySelector('[data-booth-text]')!.getBoundingClientRect();
      // A point on the text left of the drawer is covered by the scrim, not the text.
      const hit = document.elementFromPoint(text.left + 40, text.top + text.height / 2);
      return { panelLeft: panel.left, scrimHit: !!hit?.closest('[data-booth-side-scrim]') };
    });
    expect(g.scrimHit, 'the text beside the drawer is behind the dim').toBe(true);
    await page.locator('[data-booth-side-scrim]').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('#booth-side')).toBeHidden();
  });
}

// XBO-19: under 480 px the drawer takes the whole width, leaving no slivers of text beside it.
test('voice-samples-panel at 390: the drawer is the full width', async ({ page }) => {
  await drive(page, 'voice-samples-panel', { width: 390, height: 844 });
  const box = await page.locator('#booth-side').boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.width).toBe(390);
});

// XBO-23, XBO-26: Coming up's pronunciations share a column; the samples toggle is as wide as the samples it opens.
test('voice-samples-panel at 1440: Coming up is a column and the samples toggle spans its rows', async ({ page }) => {
  await drive(page, 'voice-samples-panel', { width: 1440, height: 900 });
  const g = await page.evaluate(() => {
    const panel = document.getElementById('booth-side')!;
    const coming = [...panel.querySelectorAll('section')].find((s) => s.getAttribute('aria-label') === 'Coming up')!;
    const says = [...coming.querySelectorAll('.font-mono')].map((e) => Math.round(e.getBoundingClientRect().left));
    const toggle = [...panel.querySelectorAll('button[aria-expanded]')].find((b) => /\d samples?$/.test(b.textContent?.replace(/[▴▾]/g, '') ?? ''))!;
    const row = panel.querySelector('[aria-label^="Voice samples of"] button')!;
    return { says, toggle: toggle.getBoundingClientRect().width, row: row.getBoundingClientRect().width };
  });
  expect(g.says.length, 'Coming up lists names').toBeGreaterThan(1);
  expect(new Set(g.says).size, 'every pronunciation starts at one x').toBe(1);
  expect(g.toggle, 'the toggle is as wide as a sample row').toBeCloseTo(g.row, 0);
});

// The owner's report against #2256: paragraphs are left-aligned with no first-line indent, and the narrator sets the column's width
// (Text settings › Column width, the same choice as Settings › Reader text).
test('setup: every paragraph is left-aligned with no first-line indent and no balanced or justified lines', async ({ page }) => {
  await drive(page, 'setup', { width: 1440, height: 900 });
  const looks = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-booth-text] [data-paragraph]')].map((p) => {
      const style = getComputedStyle(p);
      return { indent: style.textIndent, align: style.textAlign, wrap: style.textWrap || style.getPropertyValue('text-wrap'), hyphens: style.hyphens };
    }),
  );
  expect(looks.length).toBeGreaterThan(1);
  for (const look of looks) {
    expect(look.indent).toBe('0px');
    expect(['start', 'left']).toContain(look.align);
    expect(look.wrap).not.toMatch(/balance|pretty/);
    expect(look.hyphens).not.toBe('auto');
  }
});

// The Booth reads the Script's own setting through the same rule (`readerColumn`: the characters a line or the share of the container,
// whichever is less), so Narrow, Medium and Full stay three different widths at any window size. tests/visual/reader-column-width.spec.ts
// holds both pages at three window widths.
for (const size of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
]) {
  test(`at ${size.width}: the Reader text column width changes how wide the Booth's text column is`, async ({ page }) => {
    const width = async (state: string): Promise<number> => {
      await drive(page, state, size);
      return page.evaluate(() => document.querySelector('[data-booth-text] > div')!.getBoundingClientRect().width);
    };
    const medium = await width('setup');
    const narrow = await width('text-width-narrow');
    const full = await width('text-width-full');
    expect(narrow).toBeLessThan(medium);
    expect(full).toBeGreaterThan(medium);
  });
}
