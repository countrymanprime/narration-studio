// The Booth footer's rows (#2251, alignment audit docs/research/alignment-audit/findings/booth.md): the controls, one sentence and the
// meter, measured on the real app at the widths where the footer used to fall into a stack of little rows.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { showChapterTop } from './helpers/viewTop';

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

for (const state of ['builtin-setup', 'listening-no-mic', 'setup', 'recording']) {
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

// The chosen start's readout takes no room in the footer (#3319): at every width from 320 to 1280 px, with and without voice folders (the voice control
// wraps the footer's row early), and for a one-digit and a five-digit paragraph, the footer is the height it is with the readout taken away.
async function chooseRefusedStart(page: Page, state: 'setup' | 'voices'): Promise<void> {
  await page.addInitScript(() => {
    const sentence = 'REAPER refused to start recording, so nothing was recorded.';
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStart: () => Promise.resolve({ ok: false, outcome: 'refused', message: sentence, refused: sentence }),
    };
  });
  await drive(page, state, { width: 1280, height: 700 });
  await showChapterTop(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(page.locator('[data-toast-region] [data-tone="error"]')).toBeVisible();
  await page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' }).click();
  await expect(page.locator('[data-chosen-start]')).toBeVisible();
}

for (const state of ['setup', 'voices'] as const) {
  test(`a chosen start does not change the footer height (${state === 'voices' ? 'voice folders' : 'flat chapter'}, 320 to 1280 px)`, async ({ page }) => {
    test.setTimeout(300_000);
    await chooseRefusedStart(page, state);
    const heights = (hidden: boolean) =>
      page.evaluate((hide) => {
        const wrap = document.querySelector('[data-chosen-start]')?.closest<HTMLElement>('[role="group"]');
        if (wrap) wrap.style.display = hide ? 'none' : '';
        return document.querySelector('#btimer')!.closest('.border-t')!.getBoundingClientRect().height;
      }, hidden);
    const problems: string[] = [];
    for (let width = 320; width <= 1280; width += 20) {
      // Every width at one height; the short and tall windows at the widths where a footer row used to wrap.
      for (const height of [450, ...([320, 360, 420, 480, 540, 680, 720, 760].includes(width) ? [300, 700] : [])]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(30);
        for (const paragraph of ['1', '12345']) {
          await page.evaluate((n) => {
            const chip = document.querySelector('[data-chosen-start]');
            if (chip) chip.textContent = `Starts ¶ ${n}`;
          }, paragraph);
          if ((await page.locator('[data-chosen-start]').count()) === 0) continue;
          const without = await heights(true);
          const withChip = await heights(false);
          if (withChip !== without) problems.push(`${width}x${height} ¶ ${paragraph}: footer ${without} -> ${withChip}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
}
