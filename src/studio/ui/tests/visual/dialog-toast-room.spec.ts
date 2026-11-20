// A toast over an open dialog never covers the dialog's title, focused field or buttons, and never hides them, in a window under 300 px tall (#3605 item 2, #3601, #3549).
// In that window the toast region shows only the newest toast (older ones stay queued and appear as the newest goes), a long message scrolls inside a toast capped at 2.5rem while
// a dialog is open, `ToastRegion` publishes `--toast-h` and `Dialog` takes what is left above it. Each case opens a dialog under toasts the way the narrator meets them (one and two stacked Undo toasts over New project with its Name field focused; one long error over the status report), then walks the window's heights from 261 to 299 px at 320 px
// wide and 262, 280 and 299 px at 275 px wide: exactly one toast shows, and the title, every button and the focused field are inside the popup, inside the window, and at five points
// not under the toast. A window 300 px tall or more keeps the static room (`toast-region.spec.ts`), and the dialog's size there is the sweep's (`dialog-height-sweep.spec.ts`).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { clickVisible } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 180_000 });

/**
 * What is wrong with the open dialog's title, every button and focused field: a toast on one of five points of it, or a part of it outside the popup or the window. The body
 * scrolls, so a control in it is first scrolled to within the body (the popup itself is not scrolled: it clips between 261 and 299 px, and a narrator cannot scroll it).
 */
async function problemsOf(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const popup = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].pop();
    if (!popup) return ['no dialog is open'];
    const focused = document.activeElement && popup.contains(document.activeElement) && document.activeElement !== popup ? document.activeElement : null;
    const frame = popup.getBoundingClientRect();
    const problems: string[] = [];
    if (frame.bottom > window.innerHeight + 0.5 || frame.top < -0.5)
      problems.push(`popup ${Math.round(frame.top)}..${Math.round(frame.bottom)} leaves the window`);
    // The focused field first: scrolling the body to reach a button below it would move the field out of view before it is measured.
    const targets = new Set<Element>([...(focused ? [focused] : []), ...popup.querySelectorAll('h1, h2, h3, [data-dialog-title], button')]);
    for (const el of targets) {
      // Every scrolling ancestor inside the popup (the body, and an area in it) brings a title or button into view, innermost first; the popup itself is not scrolled. The focused field is
      // not helped: the dialog has to have kept it in view itself when the toast arrived.
      for (let scroller: HTMLElement | null = el === focused ? null : el.parentElement; scroller && scroller !== popup; scroller = scroller.parentElement) {
        if (!/auto|scroll/.test(getComputedStyle(scroller).overflowY)) continue;
        const inner = scroller.getBoundingClientRect();
        const at = el.getBoundingClientRect();
        if (at.top < inner.top) scroller.scrollTop -= inner.top - at.top;
        else if (at.bottom > inner.bottom) scroller.scrollTop += at.bottom - inner.bottom;
      }
      const box = el.getBoundingClientRect();
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName;
      // The part inside the popup and the window: whole for a title or a button, at least 24 px for a focused field (a long body needs the narrator to scroll to the rest).
      const left = Math.max(box.left, frame.left, 0);
      const right = Math.min(box.right, frame.right, window.innerWidth);
      const top = Math.max(box.top, frame.top, 0);
      const bottom = Math.min(box.bottom, frame.bottom, window.innerHeight);
      const need = el === focused ? Math.min(24, box.height) : box.height - 1;
      if (bottom - top < need || right - left < Math.min(box.width - 1, 24)) {
        problems.push(`${name} is hidden (${Math.round(Math.max(0, bottom - top))} of ${Math.round(box.height)} px high)`);
        continue;
      }
      const points: [number, number][] = [
        [(left + right) / 2, (top + bottom) / 2],
        [left + 2, top + 2],
        [right - 2, top + 2],
        [left + 2, bottom - 2],
        [right - 2, bottom - 2],
      ];
      for (const [x, y] of points) {
        if (document.elementFromPoint(x, y)?.closest('[data-toast-region]')) problems.push(`${name} is under a toast at ${Math.round(x)},${Math.round(y)}`);
      }
    }
    return problems;
  });
}

const shown = (page: Page) => page.locator('[data-toast-region] [data-tone]');

type Case = { name: string; toasts: number; focusField?: boolean; longText?: boolean; open: (page: Page) => Promise<void> };
/** New project over `count` Undo toasts (each recent project removed raises one), its Name field focused. */
const undoToasts = (count: number): Case => ({
  name: count === 1 ? 'New project with its Name field focused, one Undo toast' : `New project under ${count} stacked Undo toasts`,
  toasts: count,
  focusField: true,
  open: async (page) => {
    await page.goto('/?mockNoProject=1');
    await settlePage(page);
    const remove = page.getByRole('button', { name: /^Remove .* from recent projects/ });
    for (let n = 0; n < count; n += 1) await remove.first().click();
    await expect(page.getByRole('button', { name: 'Undo' }).or(page.locator('[data-toast-region] [data-tone]'))).not.toHaveCount(0);
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.getByRole('dialog').waitFor();
    await expect(page.getByRole('dialog').locator('input').first()).toBeFocused();
  },
});
const CASES: Case[] = [
  undoToasts(1),
  undoToasts(2),
  {
    name: 'the status report under a long error toast',
    toasts: 1,
    longText: true,
    open: async (page) => {
      await page.goto('/?mockProduction=on-pace&mockOpenFolder=fail');
      await settlePage(page);
      await clickVisible(page, 'button', 'Export status report');
      await page.getByRole('dialog').waitFor();
      await clickVisible(page, 'button', 'Export');
      await clickVisible(page, 'button', 'Open the folder');
      await expect.poll(() => page.locator('[data-toast-region] [data-tone="error"]').count()).toBeGreaterThanOrEqual(1);
    },
  },
];

// #3605 item 2: the rule reaches up to 400 px, where a toast over 100 px tall at 320 wide covered Cancel and Done (320x300-380, 275x300-380, 360x261-380, 400x261-340).
const SIZES: [number, number][] = [
  [275, 262],
  [275, 280],
  [275, 299],
  [275, 300],
  [275, 340],
  [275, 380],
  [275, 400],
  [360, 261],
  [360, 330],
  [360, 380],
  [400, 261],
  [400, 340],
  [400, 400],
  ...Array.from({ length: 140 }, (_, step): [number, number] => [320, 261 + step]),
];

for (const c of CASES) {
  test(`a toast never covers or hides the dialog's title, focused field or buttons under 400 px of height: ${c.name}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await c.open(page);
    // The stack the case raised is whole in a tall window; under 300 px only the newest shows.
    expect(await shown(page).count(), `${c.toasts} toast(s) raised`).toBe(c.toasts);
    const problems: string[] = [];
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      // A toast the pointer is over keeps its timer: the walk of 42 sizes outlasts an Undo toast's lifetime on a loaded runner, and a toast that went is not what this measures.
      await shown(page).first().hover();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-h')), { message: `${width}x${height}: the room is published` })
        .not.toBe('');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const count = await shown(page).count();
      if (count !== 1) problems.push(`${width}x${height}: ${count} toasts show, not the newest alone`);
      // A long message scrolls inside 2.5rem (40 px) over a dialog, so it never takes the dialog's room.
      const text = await page.evaluate(() => Math.round(document.querySelector('[data-toast-region] [data-toast-text]')!.getBoundingClientRect().height));
      if (text > 41) problems.push(`${width}x${height}: the toast's text is ${text} px high, over 2.5rem`);
      if (c.longText) {
        const scrolls = await page.evaluate(() => {
          const el = document.querySelector('[data-toast-region] [data-toast-text]')!;
          return el.scrollHeight > el.clientHeight + 1;
        });
        if (!scrolls) problems.push(`${width}x${height}: the long message fits in 2.5rem, so its scroll is not exercised`);
      }
      if (
        c.focusField &&
        !(await page
          .getByRole('dialog')
          .locator('input')
          .first()
          .evaluate((input) => input === document.activeElement))
      )
        problems.push(`${width}x${height}: the Name field lost focus`);
      const found = await problemsOf(page);
      if (found.length) problems.push(`${width}x${height}: ${found.join('; ')}`);
    }
    expect(problems).toEqual([]);
  });
}

// The older toasts are queued, not dropped (three toasts are covered in `Toast.test.tsx`: the mock has two recent projects).
test('under 300 px of height the older toast waits for the newest to go', async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await undoToasts(2).open(page);
  expect(await shown(page).count(), 'a tall window shows the stack').toBe(2);
  await page.setViewportSize({ width: 275, height: 280 });
  await expect(shown(page)).toHaveCount(1);
  const first = await shown(page).first().innerText();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(shown(page)).toHaveCount(1);
  expect(await shown(page).first().innerText(), 'the older toast takes its place').not.toBe(first);
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(shown(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-h'))).toBe('');
});

// The rule is for a window with a dialog open, where the dialog needs its chrome: a taller window shows the whole stack again, and with no dialog open an older error and its Retry are not hidden by a newer message.
test('the whole stack shows in a taller window and when no dialog is open', async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await undoToasts(2).open(page);
  await page.setViewportSize({ width: 275, height: 280 });
  await expect(shown(page)).toHaveCount(1);
  const first = await shown(page).first().innerText();
  await page.setViewportSize({ width: 320, height: 500 });
  await expect(shown(page)).toHaveCount(2);
  await page.setViewportSize({ width: 275, height: 280 });
  await expect(shown(page)).toHaveCount(1);
  expect(await shown(page).first().innerText(), 'the same newest toast again').toBe(first);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(shown(page)).toHaveCount(2);
});

// A toast is inverted (`--toast-bg` is `--text`): a cover or shadow painted in `--surface` on its text box puts a light band under light text (the shared `scroll-y-edges` did, on every toast).
// In both themes the text box of a toast keeps no `--surface` colour, in a tall window (no scroll cue at all) and in a short one with a dialog open (the cue is in the toast's own colours).
for (const colorScheme of ['light', 'dark'] as const) {
  test(`a toast's text box never carries the surface colour, ${colorScheme} theme`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await page.emulateMedia({ colorScheme });
    await undoToasts(1).open(page);
    const surface = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--surface)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    const image = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-toast-region] [data-toast-text]')!).backgroundImage);
    for (const [width, height] of [
      [1000, 700],
      [275, 262],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(shown(page)).toHaveCount(1);
      const background = await image();
      expect(background, `${width}x${height}: the text box's background image`).not.toContain(surface);
      if (height >= 300) expect(background, 'a tall window draws no scroll cue').toBe('none');
    }
  });
}
