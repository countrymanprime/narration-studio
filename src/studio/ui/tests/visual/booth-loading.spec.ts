// The Booth's loading, empty and error frames and the Companion's (#2251, alignment audit docs/research/alignment-audit/findings/booth.md):
// one frame at the page gutter for the empty and error states, skeletons on the real frame's measures.
import { expect, test, type Page } from '@playwright/test';
import { COMPANION_VIEWPORT } from './viewports';
import { boothDrivers } from './drivers/booth';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const driver = boothDrivers[state];
  if (!driver) throw new Error(`no booth driver for ${state}`);
  await driver(page);
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
];

// XBO-15, R4BO1-6: credits not set up and a failed read are one frame: the Booth title and the panel at the page gutter, the buttons
// under the sentence, starting where it starts.
for (const state of ['credits-missing', 'load-failed']) {
  for (const size of SIZES) {
    test(`${state} at ${size.width}: the Booth frame at the page gutter`, async ({ page }) => {
      await drive(page, state, size);
      const g = await page.evaluate(() => {
        const r = (e: Element | null) => e?.getBoundingClientRect() ?? null;
        // The visible title (the page keeps a hidden h1 of its own for the outline).
        const title = [...document.querySelectorAll('h1, h2')].find((h) => h.textContent?.trim() === 'Booth' && h.getBoundingClientRect().width > 1);
        const panel = document.querySelector('section[aria-labelledby]');
        const buttons = [...(panel?.querySelectorAll('button') ?? [])].map((b) => b.getBoundingClientRect());
        const text = r(panel?.querySelector('p') ?? null);
        return { title: r(title ?? null), panel: r(panel), text, buttons: buttons.map((b) => ({ left: b.left, top: b.top })) };
      });
      expect.soft(g.title?.left, 'the Booth title at the gutter').toBe(16);
      expect.soft(g.panel?.left, 'the panel at the gutter').toBe(16);
      expect.soft(g.buttons.length, 'the panel offers its buttons').toBeGreaterThan(0);
      expect.soft(g.buttons[0]?.left, 'the first button starts where the sentence does').toBeCloseTo(g.text!.left, 0);
      for (const b of g.buttons) expect.soft(b.top, 'the buttons under the sentence').toBeGreaterThan(g.text!.bottom);
    });
  }
}

// XBO-14, R4BO2-9: the loading frame's top bar and footer stand where the loaded page's do.
for (const size of SIZES) {
  test(`loading at ${size.width}: the skeleton's bars match the loaded page's`, async ({ page }) => {
    await drive(page, 'setup', size);
    const loaded = await page.evaluate(() => ({
      bar: document.getElementById('bprog')!.parentElement!.getBoundingClientRect().height,
      record: document.getElementById('brec')!.getBoundingClientRect().left,
    }));
    await drive(page, 'loading', size);
    const skeleton = await page.evaluate(() => {
      const region = document.querySelector('[aria-busy="true"][aria-label="Loading the Booth"]')!;
      const bar = region.firstElementChild!;
      const footer = region.children[2]!;
      return { bar: bar.getBoundingClientRect().height, record: footer.firstElementChild!.getBoundingClientRect().left };
    });
    expect.soft(skeleton.bar, 'the top bar is as tall').toBeCloseTo(loaded.bar, 0);
    expect.soft(skeleton.record, 'Record stands at the gutter').toBeCloseTo(loaded.record, 0);
  });
}

// XBO-14, R4BO1-5: the Companion's skeleton has the five sections of the loaded column.
test('companion-loading: five sections, as the loaded Companion has', async ({ page }) => {
  await drive(page, 'companion-loading', COMPANION_VIEWPORT);
  const blocks = await page.locator('[aria-label="Loading the Companion"] > div').count();
  expect(blocks).toBe(5);
});

// XBO-16, XBO-17: the Companion's script box is framed to its foot, the chapter title is said once, and the hotkeys are one per row.
test('companion-listening: one title, a framed script box and one hotkey per row', async ({ page }) => {
  await drive(page, 'companion-listening', COMPANION_VIEWPORT);
  const g = await page.evaluate(() => {
    const box = document.querySelector('[data-companion-script]')!;
    const style = getComputedStyle(box);
    const keys = [...document.querySelectorAll('[data-companion] dl dt')].map((dt) => Math.round(dt.getBoundingClientRect().top));
    return { border: style.borderBottomWidth, rows: new Set(keys).size, keys: keys.length };
  });
  expect.soft(g.border, 'the script box has a bottom edge').toBe('1px');
  expect.soft(g.rows, 'one key per row').toBe(g.keys);
  // The Script section's own bold title line; the read-along's heading names the chapter once.
  await expect.soft(page.locator('[data-companion] section p.font-semibold', { hasText: 'Down the Rabbit-Hole' })).toHaveCount(0);
});
