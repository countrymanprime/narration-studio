// The setup notice sits above the footer while Record cannot start. It must never hide the word being read, at any window size or Text size.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

type Case = { name: string; width: number; height: number; larger: number; query: string };
const CASES: Case[] = [
  { name: 'turn-on notice at 1440x900', width: 1440, height: 900, larger: 0, query: '?mockDaw=live' },
  { name: 'turn-on notice at 1440x500', width: 1440, height: 500, larger: 0, query: '?mockDaw=live' },
  { name: 'turn-on notice at 400x700', width: 400, height: 700, larger: 0, query: '?mockDaw=live' },
  { name: 'turn-on notice at 1440x900, Text size 72', width: 1440, height: 900, larger: 14, query: '?mockDaw=live' },
  { name: 'turn-on notice at 1440x500, Text size 72', width: 1440, height: 500, larger: 14, query: '?mockDaw=live' },
  { name: 'turn-on notice at 400x700, Text size 72', width: 400, height: 700, larger: 14, query: '?mockDaw=live' },
  { name: 'connect notice at 1440x500', width: 1440, height: 500, larger: 0, query: '?mockDawConnected=0&mockRecordCapabilityOn=1' },
  { name: 'connect notice at 400x700', width: 400, height: 700, larger: 0, query: '?mockDawConnected=0&mockRecordCapabilityOn=1' },
  { name: 'connect notice at 400x700, Text size 72', width: 400, height: 700, larger: 14, query: '?mockDawConnected=0&mockRecordCapabilityOn=1' },
];

/** Rects (viewport px) of the word being read, the text scroller and the notice. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element | null) => (e ? e.getBoundingClientRect() : null);
    const cursor = document.querySelector('[data-current]');
    let scroller: Element | null = cursor?.parentElement ?? null;
    while (scroller && !(/(auto|scroll|hidden)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight))
      scroller = scroller.parentElement;
    const notice = document.querySelector('#brec-setup');
    const r = (b: DOMRect | null) => (b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height } : null);
    return { cursor: r(box(cursor)), scroller: r(box(scroller)), notice: r(box(notice)), vh: innerHeight };
  });
}

for (const c of CASES) {
  test(`the notice never hides the reading position: ${c.name}`, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.goto(`/${c.query}`);
    await settlePage(page);
    await goToPage(page, 'Booth');
    await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
    await expect(page.locator('#brec-setup')).toBeVisible();
    for (let i = 0; i < c.larger; i++) await page.keyboard.press('Equal');
    // Read on: move the reading position down a few phrases, as a narrator would, so the page has to follow it.
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(600);
    const g = await geometry(page);
    expect(g.cursor, 'a reading position is shown').not.toBeNull();
    expect(g.scroller && g.notice).toBeTruthy();
    const cursor = g.cursor!;
    const scroller = g.scroller!;
    const notice = g.notice!;
    // The word is inside the text area, which ends where the notice begins.
    expect(cursor.top, 'cursor below the top of the text area').toBeGreaterThanOrEqual(scroller.top - 1);
    expect(cursor.bottom, 'cursor above the bottom of the text area').toBeLessThanOrEqual(scroller.bottom + 1);
    expect(cursor.bottom, 'cursor does not reach into the notice').toBeLessThanOrEqual(notice.top + 1);
    // The notice leaves room to read: the text area keeps at least the line being read and a share of the window.
    expect(scroller.height, 'the text area keeps room to read').toBeGreaterThanOrEqual(Math.min(cursor.bottom - cursor.top + 24, g.vh * 0.3));
    expect(notice.height, 'the notice stays below half the window').toBeLessThanOrEqual(g.vh * 0.5 + 1);
  });
}
