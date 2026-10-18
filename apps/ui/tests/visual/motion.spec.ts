import { expect, test, type Page } from '@playwright/test';
import { goToPage } from './drivers/shared';

// Motion is on here. Every other spec in this folder freezes it (helpers/settle.ts), and the atlas and Storybook do too, so this
// is the only run that sees the motion a narrator sees: a control eases on the fast token, nothing loops on a page at rest, and
// both ways of asking for reduced motion (Windows, and <html data-motion="reduce">) stop it. styles.css defines the tokens and
// the `motion-ok:` variant; src/motion.test.ts checks that every utility uses them.
const RAIL = 'aside[aria-label="Primary navigation"] > div';

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

  test('<html data-motion="reduce"> stops the rail whatever Windows says', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.evaluate(() => (document.documentElement.dataset.motion = 'reduce'));
    expect(await railTransition(page)).toBe('0s');
  });
});
