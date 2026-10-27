// The Script's chapter list and chapter cards (#2251, alignment audit docs/research/alignment-audit/findings/script.md R3SC-1,
// XSC-10, XSC-15, XSC-16, XSC-17, XSC-23, XSC-31, XSC-44): list titles never leave one word on a line, each prep dot sits on its
// title's line, credits rows are one title line tall (no empty line for a subtitle) and the key to the dots is two columns on the dots' x; a card's facts wrap
// between facts, its prep options are one width, the credits card is the chapter card's frame, its text starts at the card's edge
// under a gap, and the credits ask for their values once.
import { expect, test, type Page } from '@playwright/test';
import { scriptDrivers } from './drivers/script';
import { settlePage } from './helpers/settle';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  const driver = scriptDrivers[state];
  if (!driver) throw new Error(`no script driver for ${state}`);
  await driver(page);
}

const DESKTOP = { width: 1440, height: 900 };

test('chapter list at 1440: balanced titles, dots on the title line, credits rows one title line tall, a two-column key', async ({ page }) => {
  await drive(page, 'reader', DESKTOP);
  const g = await page.evaluate(() => {
    const list = document.querySelector('ul[aria-label="Chapters"]')!;
    const rows = [...list.querySelectorAll<HTMLButtonElement>('button[data-jump]')].map((button) => {
      const dot = button.querySelector('[data-prep]')!.getBoundingClientRect();
      // The title is the stacked TitleSubtitle's title line, over its muted subtitle.
      const title = button.querySelector('[data-title]')!;
      const range = document.createRange();
      range.selectNodeContents(title);
      const lines = [...range.getClientRects()].filter((r) => r.width > 0);
      return {
        name: title.textContent!,
        credits: button.dataset.jump!.startsWith('credits'),
        height: Math.round(button.getBoundingClientRect().height),
        dotMiddle: dot.top + dot.height / 2,
        firstLineMiddle: lines[0]!.top + lines[0]!.height / 2,
        lines: lines.length,
        lastShare: lines.length > 1 ? lines[lines.length - 1]!.width / lines[0]!.width : 1,
        dotLeft: Math.round(dot.left),
      };
    });
    const legend = document.querySelector('ul[aria-label="Prep key"]')!;
    const legendDots = [...legend.querySelectorAll('[data-prep]')].map((dot) => dot.getBoundingClientRect());
    return { rows, legendRows: new Set(legendDots.map((r) => Math.round(r.top))).size, legendLeft: Math.round(legendDots[0]!.left) };
  });
  const oneLine = g.rows.filter((row) => !row.credits && row.lines === 1).map((row) => row.height);
  for (const row of g.rows) {
    expect.soft(Math.abs(row.dotMiddle - row.firstLineMiddle), `${row.name}: the dot is on the title's first line`).toBeLessThanOrEqual(1);
    if (row.lines > 1) expect.soft(row.lastShare, `${row.name}: no word left alone on the last line`).toBeGreaterThan(0.4);
  }
  // A credits row has no subtitle and leaves no empty line for one (#2251): both are one title line tall, under a chapter row's two.
  const credits = g.rows.filter((row) => row.credits).map((row) => row.height);
  expect.soft(new Set(credits).size, 'the credits rows are one height').toBe(1);
  expect.soft(credits[0]!, 'a credits row is shorter than a chapter row, which holds a subtitle line').toBeLessThan(oneLine[0]!);
  expect.soft(g.legendRows, 'the key takes two rows').toBeLessThanOrEqual(2);
  expect.soft(g.legendLeft, "the key's dots are on the list's dot column").toBe(g.rows[0]!.dotLeft);
});

for (const size of [DESKTOP, { width: 768, height: 1024 }]) {
  test(`chapter card at ${size.width}: facts wrap between facts and the prep options are one width`, async ({ page }) => {
    await drive(page, 'reader', size);
    const card = page.getByRole('region', { name: /chapter card$/ }).first();
    const g = await card.evaluate((section) => {
      const facts = section.querySelector('p')!;
      const spans = [...facts.querySelectorAll('span')];
      const broken = spans.filter((span) => span.getClientRects().length > 1).map((span) => span.textContent);
      const group = section.querySelector('[role="group"]')!;
      const widths = [...group.querySelectorAll('button')].map((button) => Math.round(button.getBoundingClientRect().width));
      return { count: spans.length, broken, widths, text: facts.textContent };
    });
    expect.soft(g.text, 'the facts line is drawn').toMatch(/words.+without pronunciation/);
    expect.soft(g.count, 'each fact is its own unbreakable item').toBeGreaterThanOrEqual(4);
    expect.soft(g.broken, 'no fact is split over two lines').toEqual([]);
    expect.soft(new Set(g.widths).size, `one width for the prep options (${g.widths.join(', ')})`).toBe(1);
  });
}

// The closing card, far below, keeps its own strip: it is never on screen with the banner.
test('credits-setup-banner at 1440: the values are asked for once on screen', async ({ page }) => {
  await drive(page, 'credits-setup-banner', DESKTOP);
  const onScreen = await page.locator('#reader').evaluate((reader) => {
    const view = reader.querySelector('[role="region"]')!.getBoundingClientRect();
    return [...reader.querySelectorAll('button')].filter((button) => {
      const r = button.getBoundingClientRect();
      return button.textContent?.trim().toLowerCase() === 'fill in' && r.bottom > view.top && r.top < view.bottom;
    }).length;
  });
  expect(onScreen).toBe(1);
});

test('credits-cards at 1440: the chapter card frame, and the text starts at the card edge under a gap', async ({ page }) => {
  await drive(page, 'credits-cards', DESKTOP);
  const g = await page.evaluate(() => {
    const credits = document.querySelector<HTMLElement>('section[aria-label="Opening credits"]')!;
    const chapter = document.querySelector<HTMLElement>('section[aria-label$="chapter card"]')!;
    const mic = (card: HTMLElement) => card.querySelector('button')!.getBoundingClientRect();
    const line = document.querySelector<HTMLElement>('[data-para][data-ch="credits:opening"] p')!;
    const c = credits.getBoundingClientRect();
    const l = line.getBoundingClientRect();
    return {
      micRight: [Math.round(mic(credits).right), Math.round(mic(chapter).right)],
      labelLeft: [credits, chapter].map((card) => Math.round(card.querySelector('span')!.getBoundingClientRect().left)),
      lineLeft: Math.round(l.left),
      cardLeft: Math.round(c.left),
      gap: Math.round(l.top - c.bottom),
      underHeader: Math.round(c.top - document.querySelector('section[aria-label="Reader"] [role="region"]')!.getBoundingClientRect().top),
    };
  });
  expect.soft(g.micRight[0], 'Record in Booth on one right edge').toBe(g.micRight[1]);
  expect.soft(g.labelLeft[0], 'the eyebrow on one left edge').toBe(g.labelLeft[1]);
  expect.soft(g.lineLeft, 'the credits text starts at the card edge').toBe(g.cardLeft);
  expect.soft(g.gap, 'a gap between the card and its text').toBeGreaterThanOrEqual(12);
  expect.soft(g.underHeader, 'the card keeps a gap under the header after the jump').toBeGreaterThanOrEqual(12);
});
