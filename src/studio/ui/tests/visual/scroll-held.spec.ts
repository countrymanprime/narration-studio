import { expect, test } from '@playwright/test';
import { scrollToTopHeld } from './drivers/shared';

// scrollToTopHeld is what the master `file-rules` driver scrolls with (#3930). Its page draws the rest of the measured page after the rule list,
// so the first scroll is clamped to the little there is below the panel; a helper that scrolls once leaves the page where it was.
const PAGE = `<div id="scroller" style="height:300px;overflow-y:auto">
  <div style="height:400px">above</div>
  <section id="panel" style="height:200px">panel</section>
  <div id="rest" style="height:0"></div>
</div>`;

test('the scroll is taken again once the page below the panel has drawn', async ({ page }) => {
  await page.setContent(PAGE);
  // The content below the panel arrives after 400 ms: until then there is nothing to scroll to, and one scroll goes nowhere.
  await page.evaluate(() => setTimeout(() => (document.getElementById('rest')!.style.height = '600px'), 400));
  await scrollToTopHeld(page, page.locator('#panel'));
  const gap = await page.evaluate(
    () => document.getElementById('panel')!.getBoundingClientRect().top - document.getElementById('scroller')!.getBoundingClientRect().top,
  );
  expect(gap).toBeLessThanOrEqual(4);
});

test('it fails, and says why, when the page never moves', async ({ page }) => {
  await page.setContent(
    `<div id="scroller" style="height:300px;overflow-y:auto"><div style="height:100px">above</div><section id="panel" style="height:100px">panel</section></div>`,
  );
  await expect(scrollToTopHeld(page, page.locator('#panel'))).rejects.toThrow(/scrolled to the top of the page/);
});
