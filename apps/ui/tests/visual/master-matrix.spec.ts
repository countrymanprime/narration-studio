import { expect, test, type Page } from '@playwright/test';
import { measureOnMaster } from './drivers/shared';
import { settlePage } from './helpers/settle';
import { closeOverlays, expectTopmost, overlayProblems, pointerPlan } from './helpers/masterOverlayGuard';

// Master & QC's overlays (definition of done, rule 1): the row context menu, the chapter picker, and the tooltip of each icon button, each the
// topmost element at its own points and fully on screen: at every window edge and corner and beside the sidebar, over scrolled content, at
// narrow widths, and while another overlay is open. The state matrix is docs/research/master-qc-state-matrix.md.

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'small desktop', width: 1100, height: 700 },
  { name: 'tablet', width: 820, height: 600 },
  { name: 'short window', width: 1280, height: 360 },
];

/** Opens the row's context menu at `x`,`y`: the event the browser sends for a right-click there (the page's row owns the menu). */
async function contextMenuAt(page: Page, x: number, y: number): Promise<void> {
  await page
    .getByRole('grid', { name: 'Per-file checks' })
    .getByRole('row')
    .nth(1)
    .evaluate((row, at) => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 2 })), {
      x,
      y,
    });
}

for (const size of WIDTHS) {
  test.describe(`Master & QC overlays at ${size.name} (${size.width}x${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await settlePage(page);
    });

    test('the row menu is topmost and on screen at every window edge and corner, and beside the sidebar', async ({ page }) => {
      await measureOnMaster(page);
      const problems: string[] = [];
      for (const point of await pointerPlan(page)) {
        await contextMenuAt(page, point.x, point.y);
        const menu = page.getByRole('menu').last();
        problems.push(...(await overlayProblems(menu, `row menu at the ${point.label}`)));
        await closeOverlays(page);
      }
      expect(problems).toEqual([]);
    });

    test('the row menu opens over scrolled content', async ({ page }) => {
      await measureOnMaster(page);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('main, main *')) {
          if (element.scrollHeight > element.clientHeight + 1) element.scrollTop = element.scrollHeight;
        }
      });
      const row = page.getByRole('grid', { name: 'Per-file checks' }).getByRole('row').nth(1);
      if (await row.isVisible()) {
        const box = await row.boundingBox();
        if (box) await contextMenuAt(page, box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await contextMenuAt(page, size.width / 2, size.height / 2);
      }
      await expectTopmost(page.getByRole('menu').last(), 'row menu over scrolled content');
    });

    test('the chapter picker is topmost and on screen', async ({ page }) => {
      await measureOnMaster(page);
      await page.getByRole('button', { name: /^Chapter: / }).click();
      await expectTopmost(page.getByRole('menu').last(), 'chapter picker');
    });

    test('a tooltip on each icon button is topmost and on screen', async ({ page }) => {
      await measureOnMaster(page);
      for (const name of ['Play the quietest 5 s', 'Check the files again']) {
        const button = page.getByRole('button', { name });
        await button.scrollIntoViewIfNeeded();
        await button.hover();
        await expectTopmost(page.getByRole('tooltip').last(), `tooltip of ${name}`);
        await closeOverlays(page);
      }
    });

    test('the row menu opens while the chapter picker is open, and each is topmost', async ({ page }) => {
      await measureOnMaster(page);
      await page.getByRole('button', { name: /^Chapter: / }).click();
      await expectTopmost(page.getByRole('menu').last(), 'chapter picker (first overlay)');
      // A real right-click (a press, then the menu event) on a point of the first row the picker does not cover.
      const at = await page.evaluate(() => {
        const row = document.querySelectorAll('[role="grid"] [role="row"], [role="grid"] tr')[1];
        const rect = row?.getBoundingClientRect();
        if (!row || !rect) return null;
        for (let x = rect.right - 4; x > rect.left; x -= 8) {
          const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
          if (hit && row.contains(hit)) return { x, y: rect.top + rect.height / 2 };
        }
        return null;
      });
      expect(at, 'a point of the first row the picker leaves uncovered').not.toBeNull();
      if (at) await page.mouse.click(at.x, at.y, { button: 'right' });
      await expectTopmost(page.getByRole('menu').last(), 'row menu opened while the chapter picker was open');
      expect(await page.getByRole('menu').count(), 'the picker closes when the row menu opens').toBe(1);
    });
  });
}
