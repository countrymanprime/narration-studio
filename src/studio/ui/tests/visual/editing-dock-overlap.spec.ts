// Issue 2804: at 320x300 the script's text was drawn over the waveform dock's "Recording" row (the script pane is positioned, the dock was not,
// so the pane painted above it where the two overlap), and at 360x500 the row was cramped. In every small window the dock's head row is the
// topmost thing at its own points, and the head's label never overlaps its neighbours in the row.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const SIZES = [
  { width: 320, height: 300 },
  { width: 360, height: 500 },
] as const;

async function openEditing(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  await page.locator('#wavedock [data-ribbon-surface]').waitFor();
  // In a window shorter than the header, the script, the dock and the bar together, the card scrolls: bring the dock into view before measuring or dragging on it.
  await page.locator('#wavedock').scrollIntoViewIfNeeded();
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`Editing: the waveform dock's head row is not overprinted (${theme}, ${size.width}x${size.height})`, async ({ page }) => {
      await page.setViewportSize(size);
      await openEditing(page, theme);
      const result = await page.evaluate(() => {
        const dock = document.querySelector('#wavedock') as HTMLElement;
        const head = dock.querySelector('[data-ribbon-head]') as HTMLElement;
        const row = head.parentElement as HTMLElement;
        const covered: string[] = [];
        const rowBox = row.getBoundingClientRect();
        for (let x = rowBox.left + 4; x < rowBox.right - 4; x += 8) {
          for (const y of [rowBox.top + 3, rowBox.top + rowBox.height / 2, rowBox.bottom - 3]) {
            if (y < 0 || y > innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && !dock.contains(hit)) covered.push(`${Math.round(x)},${Math.round(y)} ${hit.tagName}`);
          }
        }
        const boxes = [...row.children].map((c) => c.getBoundingClientRect());
        const overlaps: string[] = [];
        boxes.forEach((a, i) =>
          boxes.slice(i + 1).forEach((b, j) => {
            if (a.width > 0 && b.width > 0 && a.left < b.right - 0.5 && b.left < a.right - 0.5) overlaps.push(`${i} over ${i + 1 + j}`);
          }),
        );
        return { covered, overlaps, sideways: row.scrollWidth > row.clientWidth + 1 };
      });
      expect(result.covered, 'something else is drawn over the head row').toEqual([]);
      expect(result.overlaps, 'the head row overlaps itself').toEqual([]);
      expect(result.sideways, 'the head row overflows sideways').toBe(false);
    });
  }
}

// A narrator drags across the waveform to choose a range: the head then names the take ("Take 1 active take") beside the zoom row's range text. The name keeps its
// natural width there (it was squeezed to a few pixels at 360x500 and 390x844); the range text and the rest give way instead.
for (const theme of ['light', 'dark'] as const) {
  for (const size of [...SIZES, { width: 390, height: 844 }] as const) {
    test(`Editing: a chosen range leaves the take name whole in the dock head (${theme}, ${size.width}x${size.height})`, async ({ page }) => {
      await page.setViewportSize(size);
      await openEditing(page, theme);
      const lane = page.locator('#wavedock [data-ribbon-surface]');
      const box = (await lane.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const head = page.locator('#wavedock [data-ribbon-head]');
      await expect(head).toContainText('active take');
      const m = await head.evaluate((el) => {
        const name = el.firstElementChild as HTMLElement;
        return { clientWidth: name.clientWidth, scrollWidth: name.scrollWidth, text: name.textContent };
      });
      expect(m.clientWidth, `"${m.text}" is squeezed to ${m.clientWidth}px of ${m.scrollWidth}px`).toBeGreaterThanOrEqual(m.scrollWidth - 1);
    });
  }
}

// Every part of the dock's head row stays on the row and clear of the others in windows from 300 to 420 px wide, with a range chosen (the name and the zoom row then
// share the line) and with a very long take name put in the label (the mock has no long name to seed, so the text of the name is replaced: this tests the layout, not the data).
async function expectRowClean(page: Page, label: string): Promise<void> {
  const problems = await page.evaluate(() => {
    const row = document.querySelector('#wavedock [data-ribbon-head]')!.parentElement as HTMLElement;
    const rowBox = row.getBoundingClientRect();
    const parts = [...row.querySelectorAll<HTMLElement>('[data-ribbon-head], [data-view-label], button')].filter((el) => el.getBoundingClientRect().width > 0);
    const found: string[] = [];
    const name = (el: HTMLElement) => el.getAttribute('aria-label') ?? el.getAttribute('data-ribbon-head') ?? el.getAttribute('data-view-label') ?? el.tagName;
    for (const el of parts) {
      const r = el.getBoundingClientRect();
      if (r.left < rowBox.left - 0.5 || r.right > rowBox.right + 0.5)
        found.push(`${name(el)} leaves the row (${Math.round(r.left)}-${Math.round(r.right)} of ${Math.round(rowBox.left)}-${Math.round(rowBox.right)})`);
      // The hint's "?" is a small glyph (15px); the zoom buttons are 32px.
      if (el.tagName === 'BUTTON' && r.width < (el.getAttribute('aria-label') === 'Waveform gestures' ? 14 : 28))
        found.push(`${name(el)} is squeezed to ${Math.round(r.width)}px`);
    }
    parts.forEach((a, i) =>
      parts.slice(i + 1).forEach((b) => {
        const x = a.getBoundingClientRect();
        const y = b.getBoundingClientRect();
        if (!a.contains(b) && !b.contains(a) && x.left < y.right - 0.5 && y.left < x.right - 0.5) found.push(`${name(a)} overlaps ${name(b)}`);
      }),
    );
    return found;
  });
  expect(problems, label).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [300, 320, 340, 360, 390, 420]) {
    for (const long of [false, true]) {
      test(`Editing: the dock head row stays whole with a range chosen${long ? ' and a very long take name' : ''} (${theme}, ${width}x400)`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 400 });
        await openEditing(page, theme);
        const box = (await page.locator('#wavedock [data-ribbon-surface]').boundingBox())!;
        await page.mouse.move(box.x + 20, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 6 });
        await page.mouse.up();
        await expect(page.locator('#wavedock [data-ribbon-head]')).toContainText('active take');
        if (long) {
          await page.locator('#wavedock [data-ribbon-head]').evaluate((head) => {
            (head.firstElementChild as HTMLElement).textContent =
              `Take 7 \u2014 a very long take name that goes on and on ${'x'.repeat(120)} \u9332\u97F3\u30C6\u30A4\u30AF`;
          });
        }
        await expectRowClean(page, `${theme} ${width}${long ? ' long name' : ''}`);
      });
    }
  }
}

// #3443: the Timeline strip's marks are hh:mm:ss.fff (12 characters each). At every size the two end marks are whole and apart: none cut off by the strip, none over another,
// and the strip draws no sideways scroll. (768 and 1024 are the guide's sizes, 360 x 500 and 320 x 300 the small windows.)
for (const size of [...SIZES, { width: 768, height: 1024 }, { width: 1024, height: 768 }] as const) {
  test(`Editing: the Timeline strip's time marks are whole and apart (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/editing/chapter-1?mockChapterLink=confirmed');
    await settlePage(page);
    await page.locator('[data-k="p-1:1"]').click();
    if (size.width >= 1360) await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    else {
      await page.getByRole('button', { name: 'Clean up and effects' }).click();
      await page.getByRole('tab', { name: 'Timeline' }).click();
    }
    const strip = page.getByRole('region', { name: /^Waveform and takes/ });
    await strip.waitFor();
    await strip.scrollIntoViewIfNeeded();
    const result = await strip.evaluate((section) => {
      const row = [...section.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].find((el) => /\d\d:\d\d:\d\d\.\d{3}/.test(el.textContent ?? ''))!;
      const marks = [...row.querySelectorAll<HTMLElement>('span')].map((el) => el.getBoundingClientRect()).filter((box) => box.width > 0);
      const edge = section.getBoundingClientRect();
      const apart = marks.every((box, i) => i === 0 || box.left >= marks[i - 1].right - 0.5 || box.top >= marks[i - 1].bottom - 0.5);
      return {
        count: marks.length,
        apart,
        inside: marks.every((box) => box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5),
        sideways: section.scrollWidth > section.clientWidth + 1,
      };
    });
    expect(result.count, 'the start and end marks are drawn').toBeGreaterThanOrEqual(2);
    expect(result.apart, 'the marks touch or overlap').toBe(true);
    expect(result.inside, 'a mark is cut off by the strip').toBe(true);
    expect(result.sideways, 'the strip scrolls sideways').toBe(false);
  });
}

// #3443: a paragraph's time stamp in the margin is 12 characters ("00:00:01.300"); it showed ":00:01.300", cut off at the left, in the 76 px gutter. At every size the whole stamp is inside its gutter.
for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, ...SIZES] as const) {
  test(`Editing: a paragraph's time stamp is whole in its margin (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/editing/chapter-1?mockChapterLink=confirmed');
    await settlePage(page);
    const stamps = await page.locator('[data-pid] [data-gutter]:not(.invisible)').evaluateAll((gutters) =>
      gutters.map((gutter) => {
        const stamp = gutter.firstElementChild as HTMLElement;
        const box = stamp.getBoundingClientRect();
        const edge = gutter.getBoundingClientRect();
        return { text: stamp.textContent, cut: stamp.scrollWidth > stamp.clientWidth + 1 || box.left < edge.left - 0.5 || box.right > edge.right + 0.5 };
      }),
    );
    expect(stamps.some((stamp) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(stamp.text ?? ''))).toBe(true);
    for (const stamp of stamps.filter((s) => s.text)) expect(stamp.cut, `"${stamp.text}" is cut off`).toBe(false);
  });
}
