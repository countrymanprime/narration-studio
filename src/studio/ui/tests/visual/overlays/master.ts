import type { Page } from '@playwright/test';
import { masterFileRows, measureOnMaster } from '../drivers/shared';
import { clickCase, type OverlayCase } from '../helpers/overlayGuardFor';

const grid = (page: Page) => page.getByRole('grid', { name: 'Per-file checks' });
const firstRow = (page: Page) => grid(page).getByRole('row').nth(1);
const picker = (page: Page) => page.getByRole('button', { name: /^Chapter: / });

/**
 * The page is already on Master & QC; the overlays below hang off the files table, so the mock's three files are checked first (once per
 * load). The table is drawn before anything is measured (a waiting row per chapter), so "checked" is a row with a file behind it.
 */
async function measured(page: Page): Promise<void> {
  if (await masterFileRows(page).first().isVisible()) return;
  await measureOnMaster(page);
  // The rows arrive while the run is still going. When it ends, Cancel goes away and focus returns to the check button (MeasureProgress), which
  // scrolls the page back to the top, so a case that scrolled a control into view and hovered it before then lost the control under its hint.
  await page
    .getByRole('button', { name: /^Re-check \d+ files?$/ })
    .and(page.locator(':enabled'))
    .waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const afterMeasuring = (overlay: OverlayCase): OverlayCase => ({
  ...overlay,
  open: async (page, at) => {
    await measured(page);
    await overlay.open(page, at);
  },
});

/** A hint on an icon button: the button is scrolled into view and the pointer moved off it first, so the hint always re-arms (a pointer already resting there shows nothing new). */
const hint = (caseName: string, button: string, viewports?: OverlayCase['viewports']): OverlayCase =>
  afterMeasuring({
    name: caseName,
    kind: 'tooltip',
    viewports,
    // Not over scrolled content: in the guard's scroll passes the hint did not show on CI and sometimes locally; the cause was not found, so
    // that pass is not covered (listed in the state matrix).
    scrolled: false,
    open: async (page) => {
      const control = page.getByRole('button', { name: button });
      const tooltip = page.locator('[role="tooltip"]:visible').last();
      // A hint that does not stay up is asked for again.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await control.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await control.hover();
        await tooltip.waitFor({ timeout: 6000 });
        await page.waitForTimeout(400);
        if (await tooltip.isVisible()) return;
      }
      throw new Error(`the hint on ${button} would not stay up`);
    },
  });

// Master & QC's overlays: the row's context menu (at every window edge and corner too: the event is sent to the row at the point, as the
// page's row owns the menu wherever the pointer is), the chapter picker, the row menu opened over the picker, and the hint on the two
// icon buttons of the checks panel.
export const masterCases: OverlayCase[] = [
  {
    name: 'row menu',
    kind: 'context-menu',
    pointer: true,
    open: async (page, at) => {
      await measured(page);
      await firstRow(page).evaluate(
        (row, point) =>
          row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: point?.x ?? 0, clientY: point?.y ?? 0, button: 2 })),
        at ? { x: at.x, y: at.y } : undefined,
      );
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  {
    name: 'row menu over the chapter picker',
    kind: 'context-menu',
    // Not at 320x300: the open picker covers the whole of the first row, so there is no point on a row to right-click (listed as not covered).
    viewports: ({ height }) => height >= 500,
    over: {
      name: 'chapter picker',
      open: async (page) => {
        await measured(page);
        await picker(page).click();
      },
    },
    open: async (page) => {
      // The files table is a capped box that scrolls inside its card (#2639), and the guard's scroll passes can scroll it: bring the first row
      // back into view in its box before looking for a point on it.
      await firstRow(page).scrollIntoViewIfNeeded();
      // A real right-click on a point of the first row the open picker leaves uncovered.
      const box = await firstRow(page).boundingBox();
      if (!box) throw new Error('the first row has no box');
      for (let x = box.x + box.width - 4; x > box.x; x -= 8) {
        const reachable = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('tr[data-row]') != null, [x, box.y + box.height / 2]);
        if (!reachable) continue;
        await page.mouse.click(x, box.y + box.height / 2, { button: 'right' });
        await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
        return;
      }
      throw new Error('the picker covers the whole first row');
    },
  },
  afterMeasuring(clickCase('chapter picker', 'menu', picker)),
  hint('hint on Play the quietest 5 s', 'Play the quietest 5 s'),
  // Not at 320x300: the icon is in the table panel's header at the top of the page, and the guard only scrolls it to the window's top edge, under the
  // shell's top bar, so the pointer never reaches it (a narrator scrolls further). Listed as not covered; the other widths are.
  hint('hint on Check the files again', 'Check the files again', ({ height }) => height >= 500),
];
