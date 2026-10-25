// The Booth footer's rows (#2251, alignment audit docs/research/alignment-audit/findings/booth.md): the controls, one sentence and the
// meter, measured on the real app at the widths where the footer used to fall into a stack of little rows.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const driver = boothDrivers[state];
  if (!driver) throw new Error(`no booth driver for ${state}`);
  await driver(page);
}

/** Centre lines and edges (viewport px) of the footer's parts. */
async function footer(page: Page) {
  return page.evaluate(() => {
    const r = (e: Element | null | undefined) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, mid: (b.top + b.bottom) / 2, width: b.width };
    };
    const meter = document.querySelector('[role="group"][aria-label="Input"]');
    const sentence = [document.getElementById('blisten-why'), document.getElementById('brec-why')].find((e) => e && e.getBoundingClientRect().width > 1);
    return {
      record: r(document.getElementById('brec')),
      meter: r(meter),
      meterBar: r(meter?.firstElementChild),
      roomChip: r(meter?.lastElementChild?.firstElementChild),
      sentence: r(sentence),
      sentences: [document.getElementById('blisten-why'), document.getElementById('brec-why')].filter((e) => e && e.getBoundingClientRect().width > 1).length,
      row: r(document.getElementById('btimer')?.closest('.border-t')),
    };
  });
}

for (const state of ['builtin-setup', 'builtin-refusal', 'listening-no-mic', 'setup', 'recording']) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    test(`${state} at ${size.width}: the meter stays on Record's row and the footer is at most two rows`, async ({ page }) => {
      await drive(page, state, size);
      const g = await footer(page);
      expect(g.record && g.meter && g.row, 'Record, the meter and the footer row are drawn').toBeTruthy();
      // R4BO1-1, R4BO2-7, XBO-10: the meter is never alone on a row of its own.
      expect(Math.abs(g.meter!.mid - g.record!.mid), "the meter on Record's row").toBeLessThanOrEqual(2);
      expect(g.meter!.right, 'the meter at the right gutter').toBeCloseTo(g.row!.right - 16, 0);
      // R3BO-5: one sentence, never two run together.
      expect(g.sentences, 'at most one sentence drawn').toBeLessThanOrEqual(1);
      if (g.sentence) {
        if (size.width >= 1024) {
          // From 1024 px the sentence shares the controls' row, between them and the meter.
          expect(g.sentence.top, 'the sentence starts on the controls row').toBeLessThan(g.record!.bottom);
          expect(g.sentence.right, 'the sentence ends before the meter').toBeLessThanOrEqual(g.meter!.left);
        } else {
          // Narrower, it is the one row under the controls, starting at the gutter.
          expect(g.sentence.top, 'the sentence under the controls').toBeGreaterThanOrEqual(g.record!.bottom);
          expect(g.sentence.left, 'the sentence starts at the gutter').toBeCloseTo(g.row!.left + 16, 0);
        }
      }
      // XBO-28: the room tone chip is centred on the meter's line.
      expect(Math.abs(g.roomChip!.mid - g.meterBar!.mid), 'the room tone chip centred on the meter').toBeLessThanOrEqual(1);
    });
  }
}

// XBO-25: Record and Stop are one width, so nothing beside them moves when a take starts.
test('Record becomes Stop without moving the timer', async ({ page }) => {
  await drive(page, 'setup', { width: 1440, height: 900 });
  const before = await page.evaluate(() => [
    document.getElementById('brec')!.getBoundingClientRect().width,
    document.getElementById('btimer')!.getBoundingClientRect().left,
  ]);
  await page.getByRole('button', { name: /^Record$/ }).click();
  await page.getByRole('button', { name: /^Stop$/ }).waitFor();
  const after = await page.evaluate(() => [
    document.getElementById('brec')!.getBoundingClientRect().width,
    document.getElementById('btimer')!.getBoundingClientRect().left,
  ]);
  expect(after[0], 'Stop is as wide as Record').toBeCloseTo(before[0], 0);
  expect(after[1], 'the timer stays where it was').toBeCloseTo(before[1], 0);
  await page.getByRole('button', { name: /^Stop$/ }).click();
});
