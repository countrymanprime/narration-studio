// A dialog's room does not fall off a cliff as the window gets shorter (#3548, #3549 B1). Every dialog kind the app has (a confirm question, a form, a wide table
// dialog, the jump menu palette and the Master render approval, which is tuned around the caps) is swept over every height from 200 to 400 px: the popup stays inside the
// window, its actions are inside it (or the popup scrolls, in a window 260 px tall or less), and neither the popup nor the body changes by more than 32 px between two heights 1 px
// apart, in either direction. A cap that switched rules at one height (the 261 px cliff: the popup was 164 px at 261 and 252 px at 260, the body 56 px at 260 and 20 px at 261)
// or sliced a sentence mid-line in 262-292 px fails here, at the height it happens at.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage, openEnginePanel, clickVisible } from './drivers/shared';
import { masterDrivers } from './drivers/master';
import { boothDrivers } from './drivers/booth';

test.use({ viewport: { width: 1440, height: 900 } });
// Each test steps the window through 201 heights and measures at each; the form dialog's took 31 s on the CI runners (shards 2 and 5), over Playwright's 30 s default.
test.describe.configure({ timeout: 120_000 });

/** The Story Bible's "Unsaved changes" question: an entry edit typed and not saved, then Production. */
async function openUnsavedQuestion(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').first().click();
  const unlock = page.getByRole('button', { name: 'Unlock entry' });
  if (await unlock.count()) await unlock.click();
  await page.getByRole('button', { name: 'Edit this entry' }).first().click();
  await page.getByRole('textbox', { name: 'Description' }).fill('A line typed and not saved.');
  await page
    .getByRole('button', { name: /^Production/ })
    .first()
    .click();
  await expect(page.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeVisible();
}

const HEIGHTS = Array.from({ length: 201 }, (_, step) => 200 + step);

// One opener for each kind of dialog the shell has. `question` has a sentence whose whole text must stay on screen.
const OPENERS: Record<string, { open: (page: Page) => Promise<void>; widths: number[]; question?: boolean; listed?: boolean }> = {
  'confirm question (unsaved changes)': { open: openUnsavedQuestion, widths: [275, 320, 400], question: true },
  'wide table dialog (Link chapters)': {
    open: async (page) => {
      await page.goto('/');
      await settlePage(page);
      await openEnginePanel(page);
      await clickVisible(page, 'button', 'Link chapters to tracks');
      await page.getByRole('dialog', { name: /Link chapters/ }).waitFor();
    },
    widths: [320, 500],
  },
  'form dialog (Who is in Num 7?)': { open: (page) => boothDrivers['voices-who-is-in'](page), widths: [320, 500] },
  'palette (jump menu)': {
    open: async (page) => {
      await page.goto('/');
      await settlePage(page);
      await page.getByRole('button', { name: /Jump to or run/ }).click();
      await page.getByRole('combobox', { name: 'Jump menu' }).waitFor();
    },
    widths: [320, 500],
    // Its buttons are the options of a list that scrolls inside the popup, not actions.
    listed: true,
  },
  'render approval (Master)': { open: (page) => masterDrivers['to-spec-approve-daw'](page), widths: [320, 500] },
};

async function measure(page: Page, question: boolean) {
  return page.evaluate((question) => {
    const box = document.querySelector('[role="alertdialog"], [role="dialog"]')!;
    const frame = box.getBoundingClientRect();
    const scrolls = box.scrollHeight > box.clientHeight + 1;
    const inside = (element: Element) => {
      const r = element.getBoundingClientRect();
      return r.right <= frame.right + 1 && r.left >= frame.left - 1 && (scrolls ? true : r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1);
    };
    const text = question ? box.querySelector('p') : null;
    const shown = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(text && hit && text.contains(hit));
    };
    const at = text?.getBoundingClientRect();
    const body = text ? (text.closest('[class*="min-h-0"]') ?? text.parentElement!) : undefined;
    return {
      popup: Math.round(frame.height),
      body: body ? Math.round(body.getBoundingClientRect().height) : 0,
      inWindow: frame.top >= -1 && frame.bottom <= window.innerHeight + 1,
      scrolls,
      textWhole: !text || !at || (shown(at.left + 4, at.top + 4) && shown(at.left + 4, at.bottom - 4)),
      unreachable: [...box.querySelectorAll('button')].filter((b) => b.textContent!.trim() && !inside(b)).map((b) => b.textContent!.trim()),
    };
  }, question);
}

for (const [kind, { open, widths, question, listed }] of Object.entries(OPENERS)) {
  for (const width of widths) {
    test(`${kind} keeps its room from 200 to 400 px tall at ${width} px wide`, async ({ page }) => {
      await open(page);
      await page.setViewportSize({ width, height: 400 });
      const problems: string[] = [];
      let previous: { height: number; popup: number; body: number } | undefined;
      for (const height of [...HEIGHTS].reverse()) {
        await page.setViewportSize({ width, height });
        const m = await measure(page, Boolean(question));
        if (!m.inWindow) problems.push(`${width}x${height}: the popup is outside the window`);
        if (question && !m.textWhole) problems.push(`${width}x${height}: the question's text is cut`);
        if (!listed && m.unreachable.length) problems.push(`${width}x${height}: ${m.unreachable.join(', ')} not inside the popup`);
        // Going down from 400 px to 200, the popup and the body may shrink with the window, but not by a cliff, and a shorter window never gets a taller one
        // (a cap that gave its room back at one height would grow here, 1 px lower). 32 px is the chrome's own change between two rules (the padding and the header at 260 px; 28 px at most today); B1 was 88 px.
        if (previous) {
          for (const [what, before, now] of [
            ['popup', previous.popup, m.popup],
            ['body', previous.body, m.body],
          ] as const) {
            if (before - now > 32) problems.push(`${width}: the ${what} falls from ${before} px at ${previous.height} to ${now} px at ${height}`);
            if (now - before > 32) problems.push(`${width}: the ${what} grows from ${before} px at ${previous.height} to ${now} px at ${height}`);
          }
        }
        previous = { height, popup: m.popup, body: m.body };
      }
      expect(problems).toEqual([]);
    });
  }
}
