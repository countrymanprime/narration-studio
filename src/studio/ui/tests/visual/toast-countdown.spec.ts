// A toast shows how long it has left (#3667): a 3 px bar along its bottom edge, inside its clipped box, that shrinks over the toast's lifetime, is held whole and still while the pointer or focus is on the toast and
// runs again from the full width on leaving, and takes no room (the toast is as tall with it as without) and covers no button. Motion is on here, as in `motion.spec.ts`; the last test is reduced motion, where a stepped bar (once a second, no animation) takes its place.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

/** Raises the recent project's Undo toast (removing a recent project) in the real app, with motion on. */
async function raise(page: Page, motion: 'no-preference' | 'reduce' = 'no-preference'): Promise<void> {
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto('/?mockNoProject=1');
  await page
    .getByRole('button', { name: /^Remove .* from recent projects/ })
    .first()
    .click();
  await page.locator('[data-toast-region] [data-tone]').first().waitFor();
}

const bar = (page: Page) => page.locator('[data-toast-region] [data-toast-countdown]').first();

test('the bar runs over the whole lifetime, sits on the bottom edge and covers no button', async ({ page }) => {
  await raise(page);
  const state = await page.evaluate(() => {
    const toast = document.querySelector('[data-toast-region] [data-tone]')!;
    const el = toast.querySelector('[data-toast-countdown]')!;
    const style = getComputedStyle(el);
    const box = toast.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    const buttons = [...toast.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      name: style.animationName,
      duration: style.animationDuration,
      height: Math.round(at.height),
      flush: Math.abs(at.bottom - box.bottom) < 1 && at.left >= box.left - 1 && at.right <= box.right + 1,
      overlaps: buttons.filter((b) => b.bottom > at.top && b.top < at.bottom).length,
      hits: [at.left + 5, (at.left + at.right) / 2, at.right - 5].map(
        (x) => document.elementFromPoint(x, at.top + 1)?.closest('[data-toast-countdown]') !== null,
      ),
      boxHeight: Math.round(box.height),
    };
  });
  expect(state.name).toBe('toast-countdown');
  expect(Number.parseFloat(state.duration) * 1000).toBeGreaterThanOrEqual(5000);
  expect(state.height).toBe(3);
  expect(state.flush, 'the bar is on the bottom edge, inside the toast').toBe(true);
  expect(state.overlaps, 'buttons the bar overlaps').toBe(0);
  expect(state.hits, 'the bar takes no press').toEqual([false, false, false]);
  // No layout jump: the toast is as tall with the bar as without it.
  await bar(page).evaluate((el) => ((el as HTMLElement).style.display = 'none'));
  const without = await page
    .locator('[data-toast-region] [data-tone]')
    .first()
    .evaluate((toast) => Math.round(toast.getBoundingClientRect().height));
  expect(without).toBe(state.boxHeight);
});

test('hovering the toast holds the bar whole and still, and leaving runs it again from the full width', async ({ page }) => {
  await raise(page);
  const toast = page.locator('[data-toast-region] [data-tone]').first();
  // Let it run a while first, so a restart is told from a bar that has only just begun.
  await page.waitForTimeout(1500);
  const running = await bar(page).evaluate((el) => ({ name: getComputedStyle(el).animationName, at: Number(el.getAnimations()[0]?.currentTime ?? -1) }));
  expect(running.name).toBe('toast-countdown');
  expect(running.at).toBeGreaterThan(1000);
  await toast.hover();
  await expect.poll(() => bar(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  const held = await bar(page).evaluate((el) => ({ scale: new DOMMatrix(getComputedStyle(el).transform).a || 1, animations: el.getAnimations().length }));
  expect(held).toEqual({ scale: 1, animations: 0 });
  // Held for longer than the toast lasts: it is still there.
  await page.waitForTimeout(5500);
  await expect(toast).toBeVisible();
  await page.mouse.move(5, 5);
  await expect.poll(() => bar(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('toast-countdown');
  const again = await bar(page).evaluate((el) => Number(el.getAnimations()[0]?.currentTime ?? -1));
  expect(again, 'the bar starts again from the full width').toBeLessThan(1000);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the bar can be told from the toast's own colour, ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await raise(page);
    // The bar's colour laid over the toast's, as a contrast ratio: a graphic that carries information needs 3:1.
    const ratio = await page.evaluate(() => {
      const toast = document.querySelector('[data-toast-region] [data-tone]')!;
      // `color-mix` reports `color(srgb r g b / a)` with the channels from 0 to 1, a plain colour `rgb(r, g, b)` from 0 to 255.
      const channels = (css: string) => {
        const numbers = (css.match(/[\d.]+/g) ?? []).map(Number);
        return css.startsWith('color(') ? numbers.map((n, i) => (i < 3 ? n * 255 : n)) : numbers;
      };
      const bg = channels(getComputedStyle(toast).backgroundColor).slice(0, 3);
      const fg = channels(getComputedStyle(toast.querySelector('[data-toast-countdown]')!).backgroundColor);
      const alpha = fg.length > 3 ? fg[3]! : 1;
      const over = [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha));
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const [hi, lo] = [lum(over), lum(bg)].sort((a, b) => b - a);
      return (hi! + 0.05) / (lo! + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
}

test('in a 320 x 300 window under a dialog the bar still sits in the toast and covers no button', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await raise(page);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog').waitFor();
  const state = await page.evaluate(() => {
    const toast = document.querySelector('[data-toast-region] [data-tone]')!;
    const at = toast.querySelector('[data-toast-countdown]')!.getBoundingClientRect();
    const box = toast.getBoundingClientRect();
    const buttons = [...toast.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      inside: at.bottom <= box.bottom + 1 && at.top >= box.top && at.left >= box.left - 1 && at.right <= box.right + 1,
      overlaps: buttons.filter((b) => b.bottom > at.top && b.top < at.bottom).length,
    };
  });
  expect(state).toEqual({ inside: true, overlaps: 0 });
});

// Under reduced motion (Windows' animation effects off, or Settings > Motion > Reduce) the bar is drawn too, stepped once a second with no animation: the one exception to the motion rule.
test('under reduced motion a stepped bar shows the time, with no animation, and is held while the pointer is on the toast', async ({ page }) => {
  await raise(page, 'reduce');
  const read = () =>
    page.evaluate(() => {
      const toast = document.querySelector('[data-toast-region] [data-tone]')!;
      const animated = toast.querySelector('[data-toast-countdown]')!;
      const step = toast.querySelector('[data-toast-countdown-stepped]')!;
      const at = step.getBoundingClientRect();
      const box = toast.getBoundingClientRect();
      return {
        animatedShown: getComputedStyle(animated).display !== 'none',
        animations: toast.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation && a.animationName === 'toast-countdown').length,
        shown: getComputedStyle(step).display !== 'none',
        height: Math.round(at.height),
        flush: Math.abs(at.bottom - box.bottom) < 1,
        scale: new DOMMatrix(getComputedStyle(step).transform).a,
        overlaps: [...toast.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().bottom > at.top).length,
      };
    });
  const first = await read();
  expect(first).toMatchObject({ animatedShown: false, animations: 0, shown: true, height: 3, flush: true, overlaps: 0 });
  expect(first.scale).toBeCloseTo(1, 1);
  // It goes down in whole steps: sampled every 250 ms for 3 s, the width changes at most four times and never goes up.
  const seen: number[] = [];
  for (let n = 0; n < 12; n += 1) {
    await page.waitForTimeout(250);
    seen.push(Math.round((await read()).scale * 1000) / 1000);
  }
  const changes = seen.filter((value, index) => index > 0 && value !== seen[index - 1]).length;
  expect(changes, `widths seen ${seen.join(', ')}`).toBeGreaterThanOrEqual(2);
  expect(changes).toBeLessThanOrEqual(4);
  expect(seen[seen.length - 1]!).toBeLessThan(seen[0]!);
  expect([...seen].sort((a, b) => b - a)).toEqual(seen);
  // Held: whole and still while the pointer is on the toast, longer than the toast lasts.
  await page.locator('[data-toast-region] [data-tone]').first().hover();
  await expect.poll(async () => (await read()).scale).toBeCloseTo(1, 1);
  await page.waitForTimeout(5500);
  await expect(page.locator('[data-toast-region] [data-tone]').first()).toBeVisible();
  expect((await read()).scale).toBeCloseTo(1, 1);
});
