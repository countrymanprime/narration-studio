import { expect, test, type Page } from '@playwright/test';
import { goToPage } from './drivers/shared';

// Motion, with motion ON. Every other spec here calls settlePage, which zeroes durations and emulates reduced motion so screenshots
// are deterministic; this one must not, because what it proves is what the browser does with the `motion-ok:` classes
// (docs/design/design-system.md#motion). It opens a slide-over (History), a menu (the page's context menu) and a toast (the chapter
// sync's "Linked …"), and holds three rules:
//
//   1. Idle budget: at rest no animation is running and none loops (`iterations: Infinity`). Only a real indeterminate progress bar may loop.
//   2. Normal motion moves, briefly: the slide-over's `transform` transition runs, and nothing takes longer than 300 ms but the highlight.
//   3. Reduced motion moves nothing: under the OS preference (`reducedMotion: 'reduce'`) and under `data-motion="reduce"` on <html>
//      (what the in-app setting will set) no transition or animation starts at all.

interface Seen {
  kind: 'transition' | 'animation';
  target: string;
  property: string;
}

/** Records every transition and animation that starts, from the first script of the page on (the toast arrives during load). */
async function recordMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Seen[] = [];
    (window as unknown as { __motionSeen: Seen[] }).__motionSeen = seen;
    const name = (target: EventTarget | null): string => {
      const element = target as Element;
      return element.hasAttribute?.('data-slide-over') ? 'slide-over' : (element.tagName ?? 'document').toLowerCase();
    };
    document.addEventListener(
      'transitionrun',
      (event) => seen.push({ kind: 'transition', target: name(event.target), property: (event as TransitionEvent).propertyName }),
      true,
    );
    document.addEventListener(
      'animationstart',
      (event) => seen.push({ kind: 'animation', target: name(event.target), property: (event as AnimationEvent).animationName }),
      true,
    );
  });
}

/** `data-motion="reduce"` on <html> from before the first script, the way the in-app setting will leave it. */
async function forceReduceAttribute(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const set = () => document.documentElement?.setAttribute('data-motion', 'reduce');
    set();
    new MutationObserver(set).observe(document, { childList: true });
  });
}

const motionSeen = (page: Page) => page.evaluate(() => (window as unknown as { __motionSeen: Seen[] }).__motionSeen);

/** What is running right now, in the page's own terms. */
const running = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return { iterations: timing?.iterations ?? 0, duration: Number(timing?.duration ?? 0), infinite: timing?.iterations === Infinity };
    }),
  );

async function expectAtRest(page: Page): Promise<void> {
  // Within 400 ms of the last change everything has settled (nothing but the highlight runs longer than 300 ms).
  await expect.poll(async () => (await running(page)).length, { timeout: 1500, intervals: [50] }).toBe(0);
  expect((await running(page)).filter((animation) => animation.infinite)).toEqual([]);
}

/** Opens a slide-over, a menu and a toast, one after the other, and leaves each open until the next opens. */
async function openOverlays(page: Page): Promise<void> {
  // The toast: the mock's chapter sync links on load and says so.
  await page
    .getByRole('status')
    .getByText(/^Linked /)
    .waitFor();

  // The slide-over: the header's History panel.
  const history = page.locator('main > header').getByRole('button', { name: 'History', exact: true });
  await history.click();
  const panel = page.locator('[data-slide-over]');
  await panel.waitFor();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // The menu: the page's own context menu. A right click on a field leaves the browser's menu, so try a few places in the content.
  const menu = page.locator('[role="menu"]:visible');
  for (const [x, y] of [
    [700, 420],
    [500, 600],
    [900, 300],
    [400, 250],
  ]) {
    await page.mouse.click(x, y, { button: 'right' });
    if (
      await menu
        .first()
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.keyboard.press('Escape');
  }
  await expect(menu.first()).toBeVisible();
}

async function openProduction(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?mockChapterSync=linked');
  await page.getByRole('heading', { level: 1, name: 'Production', exact: true }).waitFor();
}

test.describe('motion on', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a slide-over slides on the base token, and a menu and a toast leave nothing running', async ({ page }) => {
    await recordMotion(page);
    await openProduction(page);
    await openOverlays(page);
    // Not vacuous: motion really is on here. The tooltip (opened by the hover on the way) animated, and the slide-over carries its
    // base-token transition. (Base UI 1.8's Drawer never sets `data-starting-style` here, so the panel appears in place and no
    // transitionrun fires on it: slice 4 of #1456 looks at that. The class and its token are what this asserts.)
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('main > header').getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('[data-slide-over]')).toHaveCSS('transition-duration', '0.2s');
    await expectAtRest(page);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-motion'))).toBe(false);
  });

  test('nothing that runs takes longer than the slow token', async ({ page }) => {
    await recordMotion(page);
    await openProduction(page);
    const durations: number[] = [];
    await page.exposeFunction('noteDuration', (duration: number) => durations.push(duration));
    await page.evaluate(() => {
      const note = (window as unknown as { noteDuration: (d: number) => void }).noteDuration;
      const watch = () => document.getAnimations().forEach((animation) => note(Number(animation.effect?.getComputedTiming().duration ?? 0)));
      const timer = setInterval(watch, 16);
      setTimeout(() => clearInterval(timer), 4000);
    });
    await openOverlays(page);
    await page.waitForTimeout(500);
    expect(durations.length).toBeGreaterThan(0);
    expect(Math.max(...durations)).toBeLessThanOrEqual(300);
  });

  test('no page has an infinite animation at rest', async ({ page }) => {
    await openProduction(page);
    for (const name of [
      'Production',
      'Schedule',
      'Script',
      'Story Bible',
      'Editing',
      'Proof',
      'Pickups',
      'Master & QC',
      'Delivery',
      'Settings',
      'Booth',
    ] as const) {
      await goToPage(page, name);
      await page.waitForTimeout(400);
      expect(
        (await running(page)).filter((animation) => animation.infinite),
        `${name} at rest`,
      ).toEqual([]);
    }
  });

  test('the Booth text column slides 300 ms under normal motion', async ({ page }) => {
    await openProduction(page);
    await goToPage(page, 'Booth');
    const column = page.locator('[data-booth-text] > div').first();
    await expect(column).toHaveCSS('transition-duration', '0.3s');
    await expect(column).toHaveCSS('transition-property', /^transform\b/);
  });
});

test.describe('reduced motion', () => {
  async function expectNothingMoved(page: Page): Promise<void> {
    expect(await motionSeen(page), 'a transition or animation started').toEqual([]);
    expect(await running(page)).toEqual([]);
  }

  test.describe('Windows asks for it', () => {
    test.use({ reducedMotion: 'reduce' });

    test('opening a slide-over, a menu and a toast starts no transition or animation, and <html> says reduce', async ({ page }) => {
      await recordMotion(page);
      await openProduction(page);
      await openOverlays(page);
      await expectNothingMoved(page);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe('reduce');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.locator('main > header').getByRole('button', { name: 'History', exact: true }).click();
      await expect(page.locator('[data-slide-over]')).toHaveCSS('transition-duration', '0s');
    });

    test('the icon rail and the Booth text column have no transition', async ({ page }) => {
      await openProduction(page);
      await goToPage(page, 'Settings');
      await expect(page.locator('aside[aria-label="Primary navigation"] > div')).toHaveCSS('transition-duration', '0s');
      await goToPage(page, 'Booth');
      await expect(page.locator('[data-booth-text] > div').first()).toHaveCSS('transition-duration', '0s');
    });
  });

  test.describe('data-motion="reduce" without the OS asking', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('opening a slide-over, a menu and a toast starts no transition or animation', async ({ page }) => {
      await forceReduceAttribute(page);
      await recordMotion(page);
      await openProduction(page);
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
      await openOverlays(page);
      await expectNothingMoved(page);
    });

    test('the Booth text column has no transition', async ({ page }) => {
      await forceReduceAttribute(page);
      await openProduction(page);
      await goToPage(page, 'Booth');
      await expect(page.locator('[data-booth-text] > div').first()).toHaveCSS('transition-duration', '0s');
    });
  });
});
