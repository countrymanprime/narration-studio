// A dialog's room does not fall off a cliff as the window gets shorter (#3548, #3549 B1): swept over every height from 200 to 400 px at the widths a zoomed-in
// window has, the question's whole text is on screen, every action is inside the popup, and the body never gets shorter as the window gets taller by more than a
// rounding step. A cap that switched rules at one height (the 261 px cliff: the body fell from 56 px to 20 px) or sliced a sentence mid-line in 262-292 px
// fails here, at the height it happens at.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
import { masterDrivers } from './drivers/master';

test.use({ viewport: { width: 1440, height: 900 } });

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

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('[role="alertdialog"], [role="dialog"]')!;
    const frame = box.getBoundingClientRect();
    const text = box.querySelector('p')!;
    const at = text.getBoundingClientRect();
    const shown = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && text.contains(hit));
    };
    const inside = (element: Element) => {
      const r = element.getBoundingClientRect();
      return r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1 && r.left >= frame.left - 1 && r.right <= frame.right + 1;
    };
    const body = text.closest('[class*="min-h-0"]') ?? text.parentElement!;
    return {
      textWhole: shown(at.left + 4, at.top + 4) && shown(at.left + 4, at.bottom - 4),
      actionsOutside: [...box.querySelectorAll('button')].filter((b) => b.textContent!.trim() && !inside(b)).map((b) => b.textContent!.trim()),
      bodyHeight: Math.round(body.getBoundingClientRect().height),
    };
  });
}

for (const width of [275, 320, 400]) {
  test(`the unsaved-changes question keeps its room from 200 to 400 px tall at ${width} px wide`, async ({ page }) => {
    await openUnsavedQuestion(page);
    await page.setViewportSize({ width, height: 400 });
    let previous: { height: number; body: number } | undefined;
    const problems: string[] = [];
    for (const height of [...HEIGHTS].reverse()) {
      await page.setViewportSize({ width, height });
      const m = await measure(page);
      if (!m.textWhole) problems.push(`${width}x${height}: the question's text is cut`);
      if (m.actionsOutside.length) problems.push(`${width}x${height}: ${m.actionsOutside.join(', ')} outside the popup`);
      // Going down the heights from 400 to 200, the body may shrink, but not by a cliff: at most 24 px between two sizes 1 px apart.
      if (previous && previous.body - m.bodyHeight > 24)
        problems.push(`${width}: the body falls from ${previous.body} px at ${previous.height} to ${m.bodyHeight} px at ${height}`);
      previous = { height, body: m.bodyHeight };
    }
    expect(problems).toEqual([]);
  });
}

// A dialog with a table and several actions (Master's approval of a render, the one tuned around the caps at 320x300 to 500x320): across the same heights its popup never
// gets shorter as the window gets taller (no height at which its cap switches rules and falls), stays inside the window, and its actions are reachable inside it.
for (const width of [320, 500]) {
  test(`the render approval keeps a steady popup from 200 to 400 px tall at ${width} px wide`, async ({ page }) => {
    await masterDrivers['to-spec-approve-daw'](page);
    await page.setViewportSize({ width, height: 400 });
    const problems: string[] = [];
    let previous: { height: number; popup: number } | undefined;
    for (const height of [...HEIGHTS].reverse()) {
      await page.setViewportSize({ width, height });
      const m = await page.evaluate(() => {
        const box = document.querySelector('[role="alertdialog"]')!;
        const frame = box.getBoundingClientRect();
        const reach = (element: Element) => {
          const r = element.getBoundingClientRect();
          // Inside the popup, or the popup scrolls to it (a window 260 px tall or less lets the dialog itself scroll).
          return (
            r.right <= frame.right + 1 &&
            r.left >= frame.left - 1 &&
            ((r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1) || box.scrollHeight > box.clientHeight)
          );
        };
        return {
          popup: Math.round(frame.height),
          inWindow: frame.top >= -1 && frame.bottom <= window.innerHeight + 1,
          unreachable: [...box.querySelectorAll('button')].filter((b) => b.textContent!.trim() && !reach(b)).map((b) => b.textContent!.trim()),
        };
      });
      if (!m.inWindow) problems.push(`${width}x${height}: the popup is outside the window`);
      if (m.unreachable.length) problems.push(`${width}x${height}: ${m.unreachable.join(', ')} not reachable in the popup`);
      // Going down from 400 to 200 the popup may shrink with the window (1 px for 1 px, and a little more where the chrome changes), never by a cliff.
      if (previous && previous.popup - m.popup > 24)
        problems.push(`${width}: the popup falls from ${previous.popup} px at ${previous.height} to ${m.popup} px at ${height}`);
      // ...and a shorter window never gets a taller popup: a cap that gave its room back at one height would grow here, 1 px lower.
      if (previous && m.popup - previous.popup > 4)
        problems.push(`${width}: the popup grows from ${previous.popup} px at ${previous.height} to ${m.popup} px at ${height}`);
      previous = { height, popup: m.popup };
    }
    expect(problems).toEqual([]);
  });
}
