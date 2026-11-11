// A refused press says its sentence once, and a start the narrator chose is shown wherever the side panel is closed (#3322, #3319). The mock's DAW
// refuses the start through `__NARRATION_MOCK_OVERRIDES__`, the start is chosen with Start from here, and each window size the Booth supports is
// driven: the sentence is on screen once (the message, not again in the footer), the message is not cut off or sideways, the footer keeps its
// size, and "Next roll starts from ¶ n" is readable in the side panel or, with the panel closed, as the chip in the top bar.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { toastProblems } from './helpers/overlayGuard';

const REFUSAL = 'REAPER refused to start recording because the armed track is locked for the moment, so nothing was recorded. Unlock it and try again.';
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1100, height: 700 },
  { width: 720, height: 600 },
  { width: 360, height: 500 },
  { width: 320, height: 300 },
];
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const footerHeight = (page: Page) => page.evaluate(() => document.querySelector('#btimer')?.closest('.border-t')?.getBoundingClientRect().height ?? 0);

async function openRefusing(page: Page, refusal: string = REFUSAL): Promise<void> {
  await page.addInitScript((sentence) => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStart: () => Promise.resolve({ ok: false, outcome: 'refused', message: sentence, refused: sentence }),
    };
  }, refusal);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

/** How many places on screen say `sentence` right now (a screen-reader-only description is not on screen). */
const timesSaid = (page: Page, sentence: string) =>
  page.evaluate((text) => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };
    return [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && el.textContent?.includes(text) && shown(el)).length;
  }, sentence);

for (const scheme of ['light', 'dark'] as const) {
  for (const { width, height } of SIZES) {
    if (scheme === 'dark' && width !== 360 && width !== 1100) continue;
    test(`${width}x${height} ${scheme}: a refused start is said once, whole, and the chosen start is shown`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await openRefusing(page);
      const idleFooter = await footerHeight(page);
      await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
      await page
        .getByRole('menuitem', { name: /Start from here/ })
        .first()
        .click();
      const toast = page.locator('[data-toast-region] [data-tone="error"]');
      await expect(toast).toBeVisible();
      await expect(toast).toContainText('Unlock it and try again.');
      await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');

      // Said once: the message, and not again in the footer.
      expect(await timesSaid(page, REFUSAL)).toBe(1);
      // The footer is the size it was before the refusal (it never grew a sentence's rows).
      expect(await footerHeight(page)).toBe(idleFooter);
      // The message is whole and inside the window: its text does not scroll, its action and Dismiss are on screen, nothing overflows sideways.
      const fits = await page.evaluate(() => {
        const text = document.querySelector<HTMLElement>('[data-toast-region] [data-tone="error"] [data-toast-text]')!;
        const box = document.querySelector('[data-toast-region] [data-tone="error"]')!.getBoundingClientRect();
        const dismiss = document.querySelector('[data-toast-region] [data-tone="error"] [aria-label="Dismiss message"]')!.getBoundingClientRect();
        return {
          clipped: text.scrollHeight > text.clientHeight + 1,
          inside: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
          dismissInside: dismiss.right <= window.innerWidth && dismiss.bottom <= window.innerHeight,
          sideways: document.documentElement.scrollWidth > window.innerWidth,
          share: box.height / window.innerHeight,
        };
      });
      expect(await toastProblems(page)).toEqual([]);
      expect(fits.clipped).toBe(false);
      expect(fits.inside).toBe(true);
      expect(fits.dismissInside).toBe(true);
      expect(fits.sideways).toBe(false);
      // One message, not a stack of them: it leaves most of the window to the text.
      expect(fits.share).toBeLessThan(0.5);
      expect(await page.locator('[data-toast-region] [data-tone]').count()).toBe(1);

      // The chosen start is shown somewhere at every size: the panel's line while it is open, the top bar's chip while it is closed.
      await toast.getByRole('button', { name: 'Dismiss message' }).click();
      const chip = page.locator('[data-chosen-start]');
      const panelLine = page.getByText(/^Next roll starts from ¶ \d+$/);
      if ((await chip.count()) > 0) await expect(chip).toBeVisible();
      else await expect(panelLine).toBeVisible();
      expect((await chip.count()) + (await panelLine.filter({ visible: true }).count())).toBe(1);
      if ((await chip.count()) > 0) await expect(chip).toHaveText(/^Starts ¶ \d+$/);
    });
  }
}

test('a second refused press shows one message, not two', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await openRefusing(page);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-toast-region] [data-tone="error"]')).toHaveCount(1);
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await expect(page.locator('[data-toast-region] [data-tone="error"]')).toHaveCount(1);
  expect(await timesSaid(page, REFUSAL)).toBe(1);
});

// A long refusal (a pasted host error) in a small window: the toast, its text and its buttons stay inside the window (the action row under the text is taken from
// the text's cap), the text scrolls when it must, and its first line is reachable (#3322).
for (const [length, label] of [
  [330, '330 characters'],
  [10_000, '10,000 characters'],
] as const) {
  for (const { width, height } of [
    { width: 320, height: 300 },
    { width: 360, height: 500 },
    { width: 320, height: 568 },
  ]) {
    test(`a long refusal (${label}) at ${width}x${height} stays inside the window`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const long = `${'The armed track is locked, so REAPER would not start recording. '.repeat(Math.ceil(length / 64)).slice(0, length - 1)}.`;
      await openRefusing(page, long);
      await page.keyboard.press('Space');
      const toast = page.locator('[data-toast-region] [data-tone="error"]');
      await expect(toast).toBeVisible();
      await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
      expect(await toastProblems(page)).toEqual([]);
      const text = toast.locator('[data-toast-text]');
      // Whatever does not fit scrolls inside the toast, from its first line.
      expect(await text.evaluate((el) => el.scrollTop)).toBe(0);
      await expect(toast.getByRole('button', { name: 'Check again' })).toBeInViewport();
      await expect(toast.getByRole('button', { name: 'Dismiss message' })).toBeInViewport();
    });
  }
}

// A start chosen adds nothing to the top bar or the text: with the reading moved to the same word by a plain click (which also offers "Resume at"), the bar and the
// reading area are the size they are after Start from here, and the chip sits inside the slot the bar keeps for it (#3319).
for (const { width, height } of SIZES) {
  test(`${width}x${height}: choosing a start moves nothing in the top bar or the text`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const layout = () =>
      page.evaluate(() => {
        const slot = document.querySelector('[data-chosen-start-slot]')?.getBoundingClientRect();
        const chip = document.querySelector('[data-chosen-start]')?.getBoundingClientRect();
        return {
          bar: document.querySelector('[data-booth-side-keep]')!.getBoundingClientRect().height,
          text: document.querySelector('[data-booth-text]')!.getBoundingClientRect().top,
          slot: slot?.width ?? 0,
          chipInSlot: !chip || (!!slot && chip.left >= slot.left - 0.5 && chip.right <= slot.right + 0.5),
        };
      });
    const settleBar = async () => {
      await expect(page.locator('[data-recorded-through]')).toBeVisible();
      await page.waitForTimeout(500);
    };
    // Only the reading moved.
    await openRefusing(page);
    await settleBar();
    await page.locator('[data-booth-text] [data-word]').nth(40).click();
    await page.waitForTimeout(500);
    const moved = await layout();
    // The reading moved and a start was chosen.
    await openRefusing(page);
    await settleBar();
    await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: /Start from here/ })
      .first()
      .click();
    await expect(page.locator('[data-toast-region] [data-tone="error"]')).toBeVisible();
    await page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' }).click();
    await page.waitForTimeout(500);
    const chosen = await layout();
    expect(chosen.bar).toBe(moved.bar);
    expect(chosen.text).toBe(moved.text);
    expect(chosen.slot).toBe(moved.slot);
    expect(chosen.chipInSlot).toBe(true);
    // Closed panel: the slot is there and holds the chip; open panel (the wide window): no slot and no chip.
    if (chosen.slot > 0) await expect(page.locator('[data-chosen-start]')).toBeVisible();
    else await expect(page.locator('[data-chosen-start]')).toHaveCount(0);
  });
}
