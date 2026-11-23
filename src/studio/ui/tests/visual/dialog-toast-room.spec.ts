// A toast over an open dialog never covers the dialog's title, focused field or buttons, and never hides them, at any window size (#3605 items 1 and 2, #3601, #3549).
// Over a dialog the toast region shows only the newest toast (older ones stay queued and appear as the newest goes) and a long message scrolls inside two lines (2.5rem at 400 px
// of height or less). At 400 px or less `ToastRegion` publishes `--toast-h` and `Dialog` takes what is left above it; in a taller window the dialog does not change, since a toast that
// size fits the 4.75rem under it. Each case opens a dialog under toasts the way the narrator meets them (one and two Undo toasts over New project with its Name field focused; one long
// error over the status report), then walks the sizes below: exactly one toast shows, and the title, every button and the focused field are inside the popup, inside the window, and at
// five points not under the toast. With no toast the dialog's size is the sweep's (`dialog-height-sweep.spec.ts`).
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

// An older Undo toast waits mounted but not drawn (its clock runs), so only the visible ones count.
const shown = (page: Page) => page.locator('[data-toast-region] [data-tone]:visible');

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
  // #3605: above 400 px of height a toast taller than the dialog's static 4.75rem room covered its buttons (401-800 px tall at 275-400 wide; two stacked toasts at 441 wide and more).
  ...[275, 320, 360, 400, 441, 480, 560, 640].flatMap((width) => Array.from({ length: 14 }, (_, step): [number, number] => [width, 401 + step * 31])),
  ...Array.from({ length: 60 }, (_, step): [number, number] => [320, 401 + step * 7]),
  [900, 420],
  [1440, 900],
  ...Array.from({ length: 140 }, (_, step): [number, number] => [320, 261 + step]),
];

for (const c of CASES) {
  test(`a toast never covers or hides the dialog's title, focused field or buttons: ${c.name}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await c.open(page);
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
      // A long message is one line over a dialog, so it never takes the dialog's room.
      const cap = height > 400 ? 41 : 40;
      const text = await page.evaluate(() => Math.round(document.querySelector('[data-toast-region] [data-toast-text]')!.getBoundingClientRect().height));
      if (text > cap + 1) problems.push(`${width}x${height}: the toast's text is ${text} px high, over its ${cap} px`);
      if (c.longText && width <= 400) {
        // A long message is one line, cut with an ellipsis (#4063): it takes no more of the dialog's room than a short one, and carries its whole text as its title.
        const cut = await page.evaluate(() => {
          const el = document.querySelector('[data-toast-region] [data-toast-text]') as HTMLElement;
          return el.scrollWidth > el.clientWidth + 1 && (el.getAttribute('title') ?? '').length > 40;
        });
        if (!cut) problems.push(`${width}x${height}: the long message is not cut to one line with its whole text as the title`);
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
      // Above 400 px of height the toast changes nothing in the dialog (the test below), so what its own layout hides there is not the toast's doing: the status report's
      // Open the folder has no room in its scroll area at 401-432 px of height with or without a toast (#3605).
      const found = (await problemsOf(page)).filter((problem) => height <= 400 || !/^Open the folder is hidden \(\d+ of 36 px high\)$/.test(problem));
      if (found.length) problems.push(`${width}x${height}: ${found.join('; ')}`);
    }
    expect(problems).toEqual([]);
  });
}

// Above 400 px of height a toast coming or going moves nothing in the dialog (#3605: no toast may make a layout jump): the popup and its buttons are where they were once the toast is dismissed.
for (const c of CASES) {
  test(`a toast going leaves the dialog where it was above 400 px of height: ${c.name}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await c.open(page);
    const boxes = () =>
      page.evaluate(() => {
        const popup = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].pop()!;
        return [popup, ...popup.querySelectorAll('button')].map((el) => {
          const box = el.getBoundingClientRect();
          return [box.top, box.bottom, box.left, box.right].map(Math.round).join(',');
        });
      });
    const withToast: Record<string, string[]> = {};
    const sizes = [
      [275, 401],
      [275, 500],
      [320, 520],
      [320, 700],
      [400, 500],
      [441, 525],
      [640, 480],
      [1440, 900],
    ] as const;
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await shown(page).first().hover();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      withToast[`${width}x${height}`] = await boxes();
    }
    // Each toast in turn until none is left: an older one takes the newest's place if its time has not run out while it waited.
    while ((await shown(page).count()) > 0) {
      await page.getByRole('button', { name: 'Dismiss message' }).click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await boxes(), 'the popup and its buttons as a toast goes').toEqual(withToast[`${sizes.at(-1)!.join('x')}`]);
    }
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await boxes(), `${width}x${height}: the popup and its buttons with no toast`).toEqual(withToast[`${width}x${height}`]);
    }
  });
}

// The older toasts are queued, not dropped (three toasts are covered in `Toast.test.tsx`: the mock has two recent projects).
test('over a dialog the older toast waits for the newest to go', async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await undoToasts(2).open(page);
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

// An Undo is good for a fixed time from the change (the picker sends a removal 6 s after Remove). An Undo toast that waited behind a newer one must not come back afresh after that:
// its Undo answered "already removed" and restored nothing (qa on #3745). It waits with its clock running, so it is gone by the time the newest has gone.
test('an Undo toast that waited behind a newer one over a dialog does not come back with a dead Undo', async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await undoToasts(2).open(page);
  await expect(shown(page)).toHaveCount(1);
  // Past the 6 s the removals wait for an Undo: both toasts' 5 s ran from when they were raised, so none is left to offer one.
  await page.waitForTimeout(6_500);
  expect(await shown(page).count(), 'toasts still offering Undo after the removals were sent').toBe(0);
  await expect(page.getByText(/was already removed from recent projects/)).toHaveCount(0);
});

// The rule is for a window with a dialog open, where the dialog needs its chrome, at any size: with no dialog open an older error and its Retry are not hidden by a newer message.
test('the newest toast alone shows over a dialog at any size, and the whole stack when no dialog is open', async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await undoToasts(2).open(page);
  await page.setViewportSize({ width: 275, height: 280 });
  await expect(shown(page)).toHaveCount(1);
  const first = await shown(page).first().innerText();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(shown(page)).toHaveCount(1);
  await page.setViewportSize({ width: 275, height: 280 });
  await expect(shown(page)).toHaveCount(1);
  expect(await shown(page).first().innerText(), 'the same newest toast again').toBe(first);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(shown(page)).toHaveCount(2);
});

// A toast is inverted (`--toast-bg` is `--text`): a cover or shadow painted in `--surface` on its text box puts a light band under light text (the shared `scroll-y-edges` did, on every toast).
// In both themes the text box of a toast keeps no `--surface` colour, with a dialog open at any size (the cue is in the toast's own colours) and with none open (no scroll cue at all).
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
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await image(), 'no dialog open draws no scroll cue').toBe('none');
  });
}
