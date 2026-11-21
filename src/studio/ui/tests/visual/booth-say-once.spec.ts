// A refused press says its sentence once (#3322). The mock's DAW refuses the start through `__NARRATION_MOCK_OVERRIDES__`, the start is chosen with
// a clicked start, and each window size the Booth supports is driven: the sentence is on screen once (the message, not again in the footer), and the
// message is not cut off or sideways.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { toastProblems } from './helpers/overlayGuard';
import { pastStartGuard } from './helpers/startGuard';

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
    test(`${width}x${height} ${scheme}: a refused start is said once and whole`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await openRefusing(page);
      const idleFooter = await footerHeight(page);
      await page.locator('[data-booth-text] [data-word]').nth(40).click();
      await page.keyboard.press('Space'); // marking only marks (#3319): Record starts the take, from the mark
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

const bars = (page: Page) =>
  page.evaluate(() => ({
    bar: document.querySelector('[data-booth-side-keep]')!.getBoundingClientRect().height,
    text: document.querySelector('[data-booth-text]')!.getBoundingClientRect().top,
    footer: document.querySelector('#btimer')?.closest('.border-t')?.getBoundingClientRect().height ?? 0,
  }));
const settleBar = async (page: Page) => {
  await expect(page.locator('[data-recorded-through]')).toBeVisible();
  await page.waitForTimeout(500);
};
// The top bar and the text keep their size from idle to a take running (the REC pill): this state adds no row. At 320 px the REC pill itself
// wraps the tools group on main as well (101 -> 131 px at 320x300, there before this change), so that width is not asserted here; it is listed in the PR.
for (const { width, height } of SIZES.filter((size) => size.width >= 360)) {
  test(`${width}x${height}: the top bar and the text keep their size from idle to a take`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    await showChapterTop(page);
    await settleBar(page);
    const idle = await bars(page);
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500);
    const taking = await bars(page);
    expect(taking.bar).toBe(idle.bar);
    expect(taking.text).toBe(idle.text);
    expect(taking.footer).toBe(idle.footer);
  });
}

// The most toasts the app keeps at once (an error with an action and three notes, two with actions) stay inside a small window with every button reachable, and the
// bars they rise above give way to them (#3322): a take, its stop (Take saved with Undo, the check offer), a refused start, a bookmark.
for (const { width, height } of [
  { width: 320, height: 300 },
  { width: 360, height: 500 },
]) {
  test(`${width}x${height}: four toasts at once are all inside the window and every button is reachable`, async ({ page }) => {
    await page.addInitScript((sentence) => {
      let calls = 0;
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
        readAloudRecordStart: () => {
          calls += 1;
          return calls === 1
            ? Promise.resolve({ ok: true, outcome: 'started', position: 0, message: '' })
            : Promise.resolve({ ok: false, outcome: 'refused', message: sentence, refused: sentence });
        },
      };
    }, REFUSAL.repeat(3));
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    await showChapterTop(page);
    await page.keyboard.press('Space');
    const stopButton = page.getByRole('button', { name: /^Stop$/ });
    await expect(stopButton).toBeVisible({ timeout: 8000 });
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible({ timeout: 8000 });
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-toast-region] [data-tone="error"]')).toBeVisible();
    await page.keyboard.press('b');
    await expect.poll(async () => page.locator('[data-toast-region] [data-tone]').count()).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(400);
    expect(await toastProblems(page)).toEqual([]);
    // Every button is the topmost element at its own centre: nothing covers it.
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-toast-region] [data-tone] button')]
        .filter((button) => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return !hit || !button.contains(hit);
        })
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    );
    expect(covered).toEqual([]);
  });
}

// A short message with an action ("Bookmark added." and Undo) fits beside its buttons even in a small window, so it stays on one row: the action row under the text is only for a text that
// does not fit beside them (#3322).
for (const { width, height } of [
  { width: 320, height: 300 },
  { width: 360, height: 500 },
]) {
  test(`${width}x${height}: a short lone toast with an action stays on one row`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await showChapterTop(page);
    await page.keyboard.press('b');
    const toast = page.locator('[data-toast-region] [data-tone]').filter({ has: page.getByRole('button', { name: 'Undo' }) });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(400);
    const box = await toast.boundingBox();
    const text = await toast.locator('[data-toast-text]').boundingBox();
    const undo = await toast.getByRole('button', { name: 'Undo' }).boundingBox();
    expect(box && box.height).toBeLessThan(60);
    // The buttons sit beside the text, not under it.
    expect(undo && text && undo.y).toBeLessThan((text?.y ?? 0) + (text?.height ?? 0));
  });
}

// A refusal that draws nothing (a control character, a format character, a lone combining mark) still ends the press with a sentence (#3322).
for (const [name, invisible] of [
  ['a control character', '\u007F'],
  ['a format character', '\u0605'],
  ['a lone combining mark', '\u0301'],
] as const) {
  test(`a refusal of ${name} says a sentence, not an empty message`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 500 });
    await openRefusing(page, invisible);
    await page.keyboard.press('Space');
    const text = page.locator('[data-toast-region] [data-tone="error"] [data-toast-text]');
    await expect(text).toBeVisible();
    await expect(text).toContainText(/did not start recording/);
    expect((await text.boundingBox())!.width).toBeGreaterThan(20);
  });
}
