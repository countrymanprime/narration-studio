// A pedal Space must never hit Record behind an open popover. Every popover, menu and dialog the Booth opens is opened and the keys the Booth
// owns (Space, B, R, N, the arrows, Tab, Enter) are pressed with it open: the page behind must not act, focus must stay in the popup (or the popup
// must close), and Escape must close it and return focus to what opened it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

const RECORD_ON = '?mockRecordCapabilityOn=1';
const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });

async function openBooth(page: Page, query = RECORD_ON, recordReady = true): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
  if (recordReady) await expect(record(page)).toBeEnabled();
}

/** The popup takes focus a moment after it opens; a pedal fires when the narrator likes, so the keys are pressed once focus has settled. */
async function focusSettled(page: Page, popup: Locator): Promise<void> {
  await expect(popup).toBeVisible();
  await expect
    .poll(() => popup.evaluate((el) => el.contains(document.activeElement)), { timeout: 2_000 })
    .toBe(true)
    .catch(() => {});
  await page.waitForTimeout(150);
}

/** What the page behind would show if a key had reached it: a take, a bookmark, a moved cursor, a chapter change. */
async function behindTheOverlay(page: Page) {
  return page.evaluate(() => ({
    recording: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Stop'),
    rec: !!Array.from(document.querySelectorAll('span,div')).find((e) => e.children.length === 0 && e.textContent?.trim() === 'REC'),
    cursor: document.querySelector('[data-highlight="Cursor"]')?.closest('[data-word]')?.getAttribute('data-word') ?? null,
    chapter: document.querySelector('[aria-label^="Chapter:"]')?.getAttribute('aria-label') ?? null,
    toasts: Array.from(document.querySelectorAll('[role="status"]'))
      .map((e) => e.textContent?.trim() ?? '')
      .filter(Boolean)
      .join('|'),
    dialogs: document.querySelectorAll('[role="alertdialog"]').length,
    bookmarks: document.querySelectorAll('[data-bookmark]').length,
  }));
}

const KEYS = ['Space', 'KeyB', 'KeyR', 'KeyN', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'PageDown', 'Equal', 'F11'] as const;

type Overlay = {
  name: string;
  /** Opens the overlay; returns its popup and the control that opened it (focus returns there on Escape). */
  open: (page: Page) => Promise<{ popup: Locator; opener: Locator | null }>;
  /** A dialog the page itself asked (a question), not a popover: Escape answers it, so focus return is not asserted. */
  question?: boolean;
  /** A menu closes on Tab by the platform's own convention; the others hold focus. */
  menu?: boolean;
  query?: string;
  /** False when the overlay is opened with Record unavailable (the DAW not answering). */
  recordReady?: boolean;
};

const OVERLAYS: Overlay[] = [
  {
    name: 'Levels popover',
    open: async (page) => {
      const opener = page.getByRole('button', { name: 'Levels' });
      await opener.click();
      return { popup: page.getByRole('dialog', { name: 'Levels' }), opener };
    },
  },
  {
    // The walkthrough's finding: with the DAW not answering there is nothing to focus in it, so focus sits on the popup itself.
    name: 'Levels popover with the DAW not answering (nothing focusable inside)',
    query: '?mockDaw=quiet',
    recordReady: false,
    open: async (page) => {
      const opener = page.getByRole('button', { name: 'Levels' });
      await opener.click();
      return { popup: page.getByRole('dialog', { name: 'Levels' }), opener };
    },
  },
  {
    name: 'Text settings popover',
    open: async (page) => {
      const opener = page.getByRole('button', { name: 'Text settings' });
      await opener.click();
      return { popup: page.getByRole('dialog', { name: /text settings/i }), opener };
    },
  },
  {
    name: 'speaker popover (a named speaker)',
    open: async (page) => {
      const opener = page.getByRole('button', { name: /^Speaker Hatter\. Change speaker/ });
      await opener.click();
      return { popup: page.locator('[data-popover-popup]').last(), opener };
    },
  },
  {
    name: 'speaker popover (an unassigned speaker)',
    open: async (page) => {
      const opener = page.getByRole('button', { name: /^Speaker \?\. Change speaker/ });
      await opener.click();
      return { popup: page.locator('[data-popover-popup]').last(), opener };
    },
  },
  {
    name: 'chapter menu',
    menu: true,
    open: async (page) => {
      const opener = page.getByRole('button', { name: /^Chapter: .*Change chapter/ });
      await opener.click();
      return { popup: page.getByRole('menu').last(), opener };
    },
  },
  {
    name: 'right-click menu on a word',
    menu: true,
    open: async (page) => {
      await page.locator('[data-word]').nth(40).click({ button: 'right' });
      return { popup: page.getByRole('menu').last(), opener: null };
    },
  },
  {
    name: 'jump menu',
    open: async (page) => {
      await page.keyboard.press('Control+KeyK');
      return { popup: page.getByRole('combobox', { name: 'Jump menu' }).locator('xpath=ancestor::*[@role="dialog"][1]'), opener: null };
    },
  },
  {
    name: 'leave dialog (a take is running)',
    question: true,
    open: async (page) => {
      await record(page).click();
      await page.getByRole('button', { name: /^Stop$/ }).waitFor();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Escape');
      return { popup: page.getByRole('alertdialog', { name: 'Stop recording?' }), opener: null };
    },
  },
  {
    name: 'roll confirmation (a take is running)',
    question: true,
    query: `${RECORD_ON}&mockRollReplaces=1`,
    open: async (page) => {
      await record(page).click();
      await page.getByRole('button', { name: /^Stop$/ }).waitFor();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('r');
      return { popup: page.getByRole('alertdialog', { name: /^Roll again from ¶ \d+\?$/ }), opener: null };
    },
  },
];

for (const overlay of OVERLAYS) {
  test.describe(`Booth keys with the ${overlay.name} open`, () => {
    test('no key reaches the page behind it', async ({ page }) => {
      await openBooth(page, overlay.query, overlay.recordReady);
      const { popup } = await overlay.open(page);
      await focusSettled(page, popup);
      const before = await behindTheOverlay(page);
      // With focus wherever the popup put it, and again with focus on nothing (the page body), as when a pedal fires after a click on a label.
      // Judged after every key: a Space that starts a take and the next one that stops it must not cancel out.
      for (const focusBody of [false, true]) {
        if (focusBody) await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        for (const key of KEYS) {
          await page.keyboard.press(key);
          // A popover or a question stays until Escape or its own button; only a menu may close on a key (it chose an item).
          if (!overlay.menu) await expect(popup, `${key} closed the open ${overlay.name}`).toBeVisible();
          else if (!(await popup.isVisible())) return;
          const after = await behindTheOverlay(page);
          expect(after, `${key} reached the page behind the open ${overlay.name}`).toEqual(before);
        }
      }
    });

    test('Tab keeps focus in the popup or closes it, and Escape closes it with focus returned', async ({ page }) => {
      await openBooth(page, overlay.query, overlay.recordReady);
      const { popup, opener } = await overlay.open(page);
      await focusSettled(page, popup);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        if (!(await popup.isVisible())) break;
        const inside = await popup.evaluate((el) => el.contains(document.activeElement));
        expect(inside, `Tab ${i + 1} left the open ${overlay.name}`).toBe(true);
      }
      if (await popup.isVisible()) {
        await page.keyboard.press('Escape');
        await expect(popup).toBeHidden();
        if (opener && !overlay.question) await expect(opener).toBeFocused();
      }
      // A take that was not started is not running now.
      if (!overlay.question && overlay.recordReady !== false) expect((await behindTheOverlay(page)).recording).toBe(false);
    });
  });
}
