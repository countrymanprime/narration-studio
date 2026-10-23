import { expect, test } from '@playwright/test';
import { assertOverlayIsTopmost, overlayProblems } from './helpers/overlayGuard';

// The guard of the guard (helpers/overlayGuard.ts): it must pass an overlay that is on top and on screen, and name each way an
// overlay can be wrong. Built on a bare page, so no app state is involved.
const WINDOW = { width: 400, height: 300 };
const menu = (style: string) =>
  `<div role="menu" id="overlay" style="position:fixed;width:160px;height:120px;background:#eee;border:1px solid #000;${style}"><button style="width:100%;height:100%">item</button></div>`;
const cover = '<div id="cover" style="position:fixed;left:0;top:0;width:60px;height:300px;background:red;z-index:30">nav</div>';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(WINDOW);
});

test('passes an overlay that is on top and on screen', async ({ page }) => {
  await page.setContent(`${cover}${menu('left:100px;top:50px;z-index:55')}`);
  await assertOverlayIsTopmost(page, async () => undefined, { root: page.locator('#overlay'), label: 'menu' });
});

test('names the element drawn over an overlay', async ({ page }) => {
  await page.setContent(`${cover}${menu('left:20px;top:50px;z-index:10')}`);
  const problems = await overlayProblems(page.locator('#overlay'), { label: 'menu' });
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.join('\n')).toContain('menu is not topmost at its top-left');
  expect(problems.join('\n')).toContain('div(fixed z=30)');
});

test.describe('an overlay that leaves the window', () => {
  const cases: Array<[string, string, string]> = [
    ['left', 'left:-40px;top:50px', 'left edge at -40.0'],
    ['top', 'left:100px;top:-30px', 'top edge at -30.0'],
    ['right', 'left:300px;top:50px', 'right edge at 462.0'],
    ['bottom', 'left:100px;top:250px', 'bottom edge at 372.0'],
  ];
  for (const [side, style, finding] of cases) {
    test(`is reported on the ${side}`, async ({ page }) => {
      await page.setContent(menu(`${style};z-index:55`));
      const problems = await overlayProblems(page.locator('#overlay'), { label: 'menu' });
      expect(problems.join('\n')).toContain('menu is not fully on screen');
      expect(problems.join('\n')).toContain(finding);
    });
  }
});

test('reports an overlay that never shows', async ({ page }) => {
  await page.setContent('<div id="overlay" role="menu" hidden>closed</div>');
  expect(await overlayProblems(page.locator('#overlay'), { label: 'menu' })).toEqual(['menu: never became visible']);
});
