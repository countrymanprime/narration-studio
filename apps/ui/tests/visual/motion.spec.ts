import { expect, test, type Page } from '@playwright/test';
import { CHANGE_HIGHLIGHT_CLASSES } from '../../src/components/primitives/changeHighlight';
import { goToPage } from './drivers/shared';

// Motion is on here. Every other spec in this folder freezes it (helpers/settle.ts), and the atlas and Storybook do too, so this
// is the only run that sees the motion a narrator sees: a control eases on the fast token, nothing loops on a page at rest, and
// both ways of asking for reduced motion (Windows, and <html data-motion="reduce">) stop it. styles.css defines the tokens and
// the `motion-ok:` variant; src/motion.test.ts checks that every utility uses them.
const RAIL = 'aside[aria-label="Primary navigation"] > div';

/** A row drawn with the "this changed" classes, as an action's row would be: its animation durations, and its background once
 * any animation has run to its end. */
async function highlightedRow(page: Page): Promise<{ durations: number[]; background: string }> {
  return page.evaluate((classes) => {
    const row = document.createElement('div');
    row.className = classes;
    document.querySelector('main')!.append(row);
    const animations = row.getAnimations();
    const durations = animations.map((animation) => Number((animation.effect as KeyframeEffect).getComputedTiming().duration));
    for (const animation of animations) animation.finish();
    return { durations, background: getComputedStyle(row).backgroundColor };
  }, CHANGE_HIGHLIGHT_CLASSES);
}

const accentSoft = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--accent-soft)';
    document.body.append(probe);
    return getComputedStyle(probe).backgroundColor;
  });
/** The open popup's transition, as `duration property`: what it eases on opening and closing. */
async function popupTransition(page: Page, selector: string): Promise<string> {
  const popup = page.locator(selector).first();
  await popup.waitFor();
  return popup.evaluate((element) => `${getComputedStyle(element).transitionDuration} ${getComputedStyle(element).transitionProperty}`);
}

async function openPageContextMenu(page: Page): Promise<void> {
  await page
    .locator('main')
    .first()
    .click({ button: 'right', position: { x: 400, y: 400 } });
}

async function railTransition(page: Page): Promise<string> {
  return page.locator(RAIL).evaluate((rail) => getComputedStyle(rail).transitionDuration);
}

/** Animations still running after the page has had time to settle: a one-shot one has ended by then, so these loop. */
async function runningAnimations(page: Page): Promise<string[]> {
  await page.waitForTimeout(1500);
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return `${(animation as CSSAnimation).animationName ?? 'transition'} on ${target instanceof Element ? target.className : '?'}`;
      }),
  );
}

test.describe('Motion / on', () => {
  test.use({ reducedMotion: 'no-preference', viewport: { width: 1100, height: 900 } });

  test('the icon rail eases on the fast token', async ({ page }) => {
    await page.goto('/');
    expect(await railTransition(page)).toBe('0.12s');
  });

  test('a changed row fades from the accent tint once, over the highlight token, and settles to its own background', async ({ page }) => {
    await page.goto('/');
    const row = await highlightedRow(page);
    expect(row.durations).toEqual([600]);
    expect(row.background).not.toBe(await accentSoft(page));
  });

  test('a context menu eases on the fast token and settles opaque', async ({ page }) => {
    await page.goto('/');
    await goToPage(page, 'Production');
    await openPageContextMenu(page);
    expect(await popupTransition(page, '[role="menu"]')).toBe('0.12s opacity, translate');
    await expect(page.locator('[role="menu"]').first()).toHaveCSS('opacity', '1');
    expect(await runningAnimations(page)).toEqual([]);
  });

  test('the navigation drawer slides on the base token', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    expect(await popupTransition(page, '[role="dialog"]')).toMatch(/^0.2s transform/);
  });

  for (const name of ['Production', 'Script', 'Story Bible', 'Booth', 'Editing', 'Proof', 'Pickups', 'Settings'] as const) {
    test(`nothing loops on ${name} at rest`, async ({ page }) => {
      await page.goto('/');
      await goToPage(page, name);
      await page.mouse.move(1000, 850);
      expect(await runningAnimations(page)).toEqual([]);
    });
  }
});

test.describe('Motion / reduced', () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test('Windows asking for reduced motion stops the rail', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await railTransition(page)).toBe('0s');
  });

  test('a changed row holds a still accent tint under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const row = await highlightedRow(page);
    expect(row.durations).toEqual([]);
    expect(row.background).toBe(await accentSoft(page));
  });

  test('a changed row holds a still accent tint under <html data-motion="reduce">', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.evaluate(() => (document.documentElement.dataset.motion = 'reduce'));
    const row = await highlightedRow(page);
    expect(row.durations).toEqual([]);
    expect(row.background).toBe(await accentSoft(page));
  });

  test('a context menu appears at once under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await goToPage(page, 'Production');
    await openPageContextMenu(page);
    expect(await popupTransition(page, '[role="menu"]')).toBe('0s all');
    await expect(page.locator('[role="menu"]').first()).toHaveCSS('opacity', '1');
  });

  test('data-motion="reduce" on the page stops the rail whatever Windows says', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.evaluate(() => (document.documentElement.dataset.motion = 'reduce'));
    expect(await railTransition(page)).toBe('0s');
  });
});
