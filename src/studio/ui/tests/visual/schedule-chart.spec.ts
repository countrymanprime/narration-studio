import { expect, test } from '@playwright/test';
import { scheduleDrivers } from './drivers/schedule';

// The Schedule's chart (alignment audit XSH-8, R3SH-8, XSH-16, XSH-18): no note is printed on a gridline or against the axis labels, the
// plot's left labels and its right end sit about as far in from the card's content edges, the plot starts just under the header, and
// with no due date a caption says what draws the plan line.
for (const width of [1440, 1024, 768]) {
  for (const state of ['on-pace', 'no-due-date']) {
    test(`Schedule / the chart's notes and frame / ${state} / ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await scheduleDrivers[state]!(page);
      const chart = page.locator('section:has(h2:text-is("Recorded audio vs plan"))');
      const m = await chart.evaluate((card) => {
        const svg = card.querySelector('svg[role="img"]')!;
        const box = svg.getBoundingClientRect();
        const texts = [...svg.querySelectorAll('text')];
        const rects = (els: Element[]) => els.map((el) => el.getBoundingClientRect());
        const labels = rects(texts.filter((t) => /^\d+h$/.test(t.textContent ?? '')));
        const grid = rects([...svg.querySelectorAll('line')].filter((l) => l.getAttribute('y1') === l.getAttribute('y2')));
        const words = rects(texts.filter((t) => /[a-z]{4,}/i.test(t.textContent ?? '') && !/^(due|done|today)/.test(t.textContent ?? '')));
        const header = card.firstElementChild!.getBoundingClientRect();
        return {
          leftInset: Math.min(...labels.map((r) => r.left)) - box.left,
          rightInset: box.right - Math.max(...grid.map((r) => r.right)),
          topBand: Math.min(...grid.map((r) => r.top), ...rects([...svg.querySelectorAll('[data-line="due"]')]).map((r) => r.top)) - header.bottom,
          wordsOnGrid: words.filter((w) => grid.some((g) => g.top > w.top && g.top < w.bottom)).length,
          note: card.querySelector('[data-chart-note]')?.textContent ?? '',
        };
      });
      expect(m.wordsOnGrid, 'no note sits on a gridline').toBe(0);
      expect(Math.abs(m.leftInset - m.rightInset), 'the plot is inset alike on the left and the right').toBeLessThanOrEqual(6);
      expect(m.topBand, 'no empty band under the header').toBeLessThanOrEqual(24);
      if (state === 'no-due-date') expect(m.note).toContain('Set a due date to see the plan line.');
    });
  }
}
