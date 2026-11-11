// A refused press says its sentence once, and a start the narrator chose is shown wherever the side panel is closed (#3322, #3319). The mock's DAW
// refuses the start through `__NARRATION_MOCK_OVERRIDES__`, the start is chosen with Start from here, and each window size the Booth supports is
// driven: the sentence is on screen once (the message, not again in the footer), the message is not cut off or sideways, the footer keeps its
// size, and "Next roll starts from ¶ n" is readable in the side panel or, with the panel closed, as the chip in the top bar.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

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

async function openRefusing(page: Page): Promise<void> {
  await page.addInitScript((sentence) => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStart: () => Promise.resolve({ ok: false, outcome: 'refused', message: sentence, refused: sentence }),
    };
  }, REFUSAL);
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
      if ((await chip.count()) > 0) await expect(chip).toHaveText(/^Starts from ¶ \d+$/);
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
