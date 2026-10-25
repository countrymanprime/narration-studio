// The Booth's alignment fixes (#2251, alignment audit docs/research/alignment-audit/findings/booth.md), measured on the real app at
// the widths where each defect showed. Each block names the findings it guards.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const driver = boothDrivers[state];
  if (!driver) throw new Error(`no booth driver for ${state}`);
  await driver(page);
}

type Box = { left: number; right: number; top: number; bottom: number };

// XBO-3, R3BO-2, R4BO2-5, XBO-11, XBO-22: the top bar's status chips and two tools are one group at the bar's right edge, which
// wraps as a whole, so nothing lands under Previous; its chips are one height; the chapter name is not cut while it fits.
test.describe('the top bar', () => {
  for (const state of ['setup', 'recording', 'record-connect', 'pickup-session', 'cold-read']) {
    for (const size of WIDTHS) {
      test(`${state} at ${size.width}: the tools stay right, together, and off Previous's column`, async ({ page }) => {
        await drive(page, state, size);
        const g = await page.evaluate(() => {
          const box = (e: Element): Box => {
            const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          };
          // The bar is what holds the progress line; its tools are the status chips after the progress line and the two icon buttons.
          const bar = document.getElementById('bprog')?.parentElement ?? null;
          const panel = document.getElementById('brailbtn');
          const text = bar?.querySelector('button[aria-label="Text settings"]');
          const setup = bar?.querySelector('button[aria-label^="Recording setup"], [role="group"][aria-label^="Recording setup"]');
          const previous = bar?.querySelector('button');
          const tools = [panel, text, setup].filter((e): e is HTMLElement => !!e);
          return {
            bar: bar ? box(bar) : null,
            padRight: bar ? parseFloat(getComputedStyle(bar).paddingRight) : 0,
            tools: tools.map(box),
            previous: previous ? box(previous) : null,
            panel: panel ? box(panel) : null,
            // The status chips: REC, the cold read, Pickups (badges, drawn with a solid border), the setup and resume chips (fully rounded).
            chipHeights: [...(bar?.querySelectorAll('.rounded-full, .border-solid') ?? [])].map((e) => Math.round(e.getBoundingClientRect().height)),
          };
        });
        expect(g.bar && g.previous && g.panel, 'bar, Previous and the panel toggle are drawn').toBeTruthy();
        expect(g.tools.length, 'the panel toggle, Text settings and the setup chip').toBe(3);
        const bar = g.bar!;
        const panel = g.panel!;
        const previous = g.previous!;
        // The panel toggle ends at the bar's content edge, the same 16 px gutter the page uses.
        expect(Math.abs(panel.right - (bar.right - g.padRight)), 'the panel toggle sits at the right gutter').toBeLessThanOrEqual(1);
        expect(g.padRight, 'the bar uses the page gutter').toBe(16);
        // Every tool is on one row with the toggle, so a wrap moves the group, never one tool.
        for (const b of g.tools) expect(Math.abs(b.top + b.bottom - panel.top - panel.bottom) / 2, 'tools share the toggle row').toBeLessThanOrEqual(2);
        // Nothing of the group sits under the Previous button (A9: icon buttons stacked in a column at the left).
        for (const b of g.tools) expect(b.left > previous.right || b.top < previous.bottom, 'no tool stacked under Previous').toBe(true);
        // The status chips are one family: the HeaderChip's 22 px pill.
        for (const h of g.chipHeights) expect(h, 'one chip height').toBe(22);
      });
    }
  }

  test('setup at 1024: the chapter name is not cut while the bar has room for it', async ({ page }) => {
    await drive(page, 'setup', { width: 1024, height: 768 });
    const cut = await page.evaluate(() => {
      const label = document.querySelector("[aria-label^='Chapter:'] span, [aria-label^='Chapter:']");
      const text = [...(document.querySelector("[aria-label^='Chapter:']")?.querySelectorAll('*') ?? [])].find(
        (e) => getComputedStyle(e).textOverflow === 'ellipsis',
      );
      const el = (text ?? label) as HTMLElement | null;
      return el ? el.scrollWidth - el.clientWidth : -1;
    });
    expect(cut, 'the chapter name fits its picker').toBe(0);
  });
});

// R4BO1-3, R4BO2-10: the resume chip is not offered while the reading position already is the offered place.
test('choosing the resume place takes the chip away', async ({ page }) => {
  await drive(page, 'setup', { width: 1440, height: 900 });
  const chip = page.getByRole('button', { name: /^Resume at ¶/ });
  await chip.click();
  await expect(chip).toHaveCount(0);
});
