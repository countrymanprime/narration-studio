// Every popover, menu and dialog the Booth opens is opened and the keys the Booth owns (Space, B, R, N, the arrows, Tab, Enter) are pressed with it
// open: the page behind must not act, focus must stay in the popup (or the popup must close), and Escape must close it and return focus to what
// opened it. The one key that does reach the take is a pedal's Space (owner ruling): with a menu or popover open it closes the popup and records or
// stops, unless focus is in a field that takes typed text; a dialog or question keeps Space like every other key.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
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
  /** A dialog that keeps Space (a question, the Jump menu); a menu or popover yields it to the take. */
  keepsSpace?: boolean;
  /** The question opens with focus on its safe button ("Keep recording", #2148): with focus there Space and Enter press that button, which closes the
   * question and lets the take go on, so they are not the keys a leak is judged by; the pass with focus on the page still is. */
  safeDefault?: boolean;
  /** Focus opens on a field that takes typed text: Space types a space there, and the pedal wins once focus is elsewhere. */
  typesSpace?: boolean;
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
    typesSpace: true,
    open: async (page) => {
      const opener = page.getByRole('button', { name: /^Speaker Hatter\. Change speaker/ });
      await opener.click();
      return { popup: page.locator('[data-popover-popup]').last(), opener };
    },
  },
  {
    name: 'speaker popover (an unassigned speaker)',
    typesSpace: true,
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
    keepsSpace: true,
    open: async (page) => {
      await page.keyboard.press('Control+KeyK');
      return { popup: page.getByRole('combobox', { name: 'Jump menu' }).locator('xpath=ancestor::*[@role="dialog"][1]'), opener: null };
    },
  },
  {
    name: 'leave dialog (a take is running)',
    question: true,
    keepsSpace: true,
    safeDefault: true,
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
    keepsSpace: true,
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
          if (key === 'Space' && !overlay.keepsSpace) continue;
          // With focus on the question's safe button, Space and Enter press it (the next test); only the pass with focus on the page judges them.
          if (overlay.safeDefault && !focusBody && (key === 'Space' || key === 'Enter')) continue;
          await page.keyboard.press(key);
          // A popover or a question stays until Escape or its own button; only a menu may close on a key (it chose an item).
          if (!overlay.menu) await expect(popup, `${key} closed the open ${overlay.name}`).toBeVisible();
          else if (!(await popup.isVisible())) return;
          const after = await behindTheOverlay(page);
          expect(after, `${key} reached the page behind the open ${overlay.name}`).toEqual(before);
        }
      }
    });

    if (overlay.safeDefault)
      test('the question opens on its safe button: Space presses it, the question closes and the take goes on', async ({ page }) => {
        await openBooth(page, overlay.query, overlay.recordReady);
        const { popup } = await overlay.open(page);
        await focusSettled(page, popup);
        await expect(popup.getByRole('button', { name: 'Keep recording' })).toBeFocused();
        await page.keyboard.press('Space');
        await expect(popup).toBeHidden();
        expect((await behindTheOverlay(page)).recording).toBe(true);
      });

    if (!overlay.keepsSpace)
      test('a pedal Space closes it and starts the take, and with a take running stops it', async ({ page }) => {
        await openBooth(page, overlay.query, overlay.recordReady);
        if (overlay.recordReady === false) return;
        const { popup, opener } = await overlay.open(page);
        await focusSettled(page, popup);
        if (overlay.typesSpace) {
          await page.keyboard.press('Space');
          await expect(popup).toBeVisible();
          await expect(record(page)).toBeVisible();
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        }
        await page.keyboard.press('Space');
        await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
        await expect(popup).toBeHidden();
        // The chapter and speaker pickers are off while a take runs, so only the others can be opened again to stop it.
        if (opener && !(await opener.isEnabled())) return;
        const reopened = await overlay.open(page);
        await focusSettled(page, reopened.popup);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await pastStartGuard(page);
        await page.keyboard.press('Space');
        await expect(record(page)).toBeVisible();
        await expect(reopened.popup).toBeHidden();
        expect(await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording)).toBe(false);
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

// The independent walkthrough's blocker: closing an overlay returns focus to the button that opened it, a focused button took the pedal's Space, and the
// pedal went dead until the narrator clicked something.
test.describe('the pedal works after an overlay closes', () => {
  const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

  test('leave question, Escape, Escape (Keep recording), Space stops the take', async ({ page }) => {
    await openBooth(page);
    await record(page).click();
    await page.getByRole('button', { name: /^Stop$/ }).waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(false);
  });

  test('Levels, Escape, Space toggles the take instead of opening Levels again', async ({ page }) => {
    await openBooth(page);
    await page.getByRole('button', { name: 'Levels' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Levels' })).toHaveCount(0);
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible();
  });

  test('Escape with a toolbar button focused still asks during a take', async ({ page }) => {
    await openBooth(page);
    await record(page).click();
    await page.getByRole('button', { name: /^Stop$/ }).waitFor();
    await page.getByRole('button', { name: 'Toggle the side panel' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog', { name: 'Stop recording?' })).toBeVisible();
  });
});

test.describe('a pedal Space with a popup open, by the control that has focus', () => {
  test('the Font select and the Size slider in Text settings hand Space to the take', async ({ page }) => {
    for (const name of [/^Font$/, /^Size/]) {
      await openBooth(page);
      await page.getByRole('button', { name: 'Text settings' }).click();
      const popup = page.getByRole('dialog', { name: /text settings/i });
      await focusSettled(page, popup);
      await popup.getByRole(name.source === '^Font$' ? 'combobox' : 'slider', { name }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
      await expect(popup).toBeHidden();
      await pastStartGuard(page);
      await page.keyboard.press('Space');
      await expect(record(page)).toBeVisible();
    }
  });

  test('a take running, a right click and Space stops the take and closes the menu', async ({ page }) => {
    await openBooth(page);
    await record(page).click();
    await page.getByRole('button', { name: /^Stop$/ }).waitFor();
    await page.locator('[data-word]').nth(40).click({ button: 'right' });
    const menu = page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('a text field inside a popup keeps its Space', async ({ page }) => {
    await openBooth(page);
    await page.getByRole('button', { name: 'Levels' }).click();
    const popup = page.getByRole('dialog', { name: 'Levels' });
    await focusSettled(page, popup);
    await popup.evaluate((el) => {
      const field = document.createElement('input');
      field.type = 'text';
      field.setAttribute('aria-label', 'scratch');
      el.append(field);
    });
    await popup.getByLabel('scratch').fill('a');
    await page.keyboard.press('Space');
    await expect(popup.getByLabel('scratch')).toHaveValue('a ');
    await expect(record(page)).toBeVisible();
    await expect(popup).toBeVisible();
  });
});
