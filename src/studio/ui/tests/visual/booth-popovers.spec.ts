// The Booth's speaker picker and Levels popover (#2251, alignment audit docs/research/alignment-audit/findings/booth.md): a status
// column with one right edge, a search box that says what it is for, and one label style and rhythm in Levels.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const driver = boothDrivers[state];
  if (!driver) throw new Error(`no booth driver for ${state}`);
  await driver(page);
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
]) {
  // XBO-8: "1 sample" and "no sample" end at one x; the search box has a placeholder.
  test(`voice-samples-picker at ${size.width}: the sample column has one right edge`, async ({ page }) => {
    await drive(page, 'voice-samples-picker', size);
    const g = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"][aria-label="Speakers"]')!;
      const rights = [...list.querySelectorAll('[role="option"] span')]
        .filter((e) => /^(no sample|\d+ samples?)$/.test(e.textContent ?? ''))
        .map((e) => Math.round(e.getBoundingClientRect().right));
      const search = document.querySelector<HTMLInputElement>('input[aria-label="Search speakers"], input[placeholder]');
      return { rights, placeholder: search?.placeholder ?? '' };
    });
    expect.soft(g.rights.length, 'rows with and without samples are listed').toBeGreaterThan(1);
    expect.soft(new Set(g.rights).size, 'one right edge for the sample column').toBe(1);
    expect.soft(g.placeholder, 'the search box says what it searches').not.toBe('');
  });

  // XBO-21: every section label of Levels is drawn alike, and the sections are spaced alike.
  test(`levels-menu at ${size.width}: one label style and one gap between sections`, async ({ page }) => {
    await drive(page, 'levels-menu', size);
    const g = await page.evaluate(() => {
      // The sections' box: the parent of the section that the Microphone label heads.
      const microphone = [...document.querySelectorAll('span')].find((e) => e.textContent === 'Microphone')!;
      const sections = [...microphone.parentElement!.parentElement!.children];
      const labelled = sections.filter((s) => s.firstElementChild && getComputedStyle(s.firstElementChild).textTransform === 'uppercase').length;
      const boxes = sections.map((s) => s.getBoundingClientRect());
      const gaps = boxes.slice(1).map((r, i) => Math.round(r.top - boxes[i]!.bottom));
      return { count: sections.length, labelled, gaps };
    });
    expect.soft(g.labelled, 'every section starts with a section label').toBe(g.count);
    expect.soft(new Set(g.gaps).size, 'one gap between sections').toBe(1);
  });
}
