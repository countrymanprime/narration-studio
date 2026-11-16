import { expect, type Locator, type Page } from '@playwright/test';

/** `spare` is the room, in px, the sentence must have left below it in the body: a font a hair wider than this machine's may not cut it off. */
export async function expectFits(page: Page, dialog: Locator, spare = 0, minSlack = 8): Promise<void> {
  const body = dialog
    .locator('p, [id]')
    .filter({ hasText: /\?$|\.$/ })
    .first();
  await expect(body).toBeVisible();
  const clipped = await body.evaluate((node, room) => {
    const rect = node.getBoundingClientRect();
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY !== 'visible') {
        const box = parent.getBoundingClientRect();
        return rect.bottom > box.bottom - room + 0.5 || rect.top < box.top - 0.5 ? `${rect.bottom} past ${box.bottom} less ${room}` : '';
      }
    }
    return '';
  }, spare);
  expect(clipped, 'the sentence is cut off by the dialog').toBe('');
  // The two widest buttons share a row of the action row. Their labels on one line plus the gap really rendered between them (not the action row's own gap: a ConfirmDialog
  // keeps these two inside a wrapper with a gap of its own) must fit the row's inside width with `minSlack` to spare, so a font a hair wider does not break a label or push
  // a button to a row of its own (the reviewer measured 278.5 px needed in 278, then 8 px apart where 4 was assumed, #3521).
  const slack = await dialog.getByRole('button').evaluateAll((buttons) => {
    const actions = buttons.filter((button) => button.getBoundingClientRect().top > (buttons[0]?.getBoundingClientRect().bottom ?? 0));
    if (!actions.length) return 99;
    const natural = actions.map((button) => {
      const el = button as HTMLElement;
      const before = [el.style.whiteSpace, el.style.flexShrink];
      el.style.whiteSpace = 'nowrap';
      el.style.flexShrink = '0';
      const width = el.getBoundingClientRect().width;
      [el.style.whiteSpace, el.style.flexShrink] = before;
      return { el, width };
    });
    const widest = natural.sort((a, b) => b.width - a.width).slice(0, 2);
    const row = actions[0]!.closest('[class*="justify-end"]') as HTMLElement;
    const own = getComputedStyle(row);
    const inside = row.clientWidth - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight);
    const gapOf = (parent: HTMLElement) => parseFloat(getComputedStyle(parent).columnGap) || 0;
    const [first, second] = widest;
    const together = second && first!.el.parentElement === second.el.parentElement;
    const gap = second ? (together ? gapOf(first!.el.parentElement!) : gapOf(row)) : 0;
    return inside - (widest.reduce((sum, item) => sum + item.width, 0) + gap);
  });
  expect(slack, 'the action row has room to keep its two widest labels on one line').toBeGreaterThanOrEqual(minSlack);
  const view = page.viewportSize()!;
  for (const button of await dialog.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.y + box.height, await button.innerText()).toBeLessThanOrEqual(view.height);
    expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(view.width);
    // A label that breaks onto a second line is caught by its line count, not by the button's height: each label's text sits on one line.
    const lines = await button.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tops = new Set<number>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    });
    expect(lines, `${await button.innerText()} stays on one line`).toBeLessThanOrEqual(1);
  }
}

/** Makes every button of the dialog `px` wider on each side, standing for a font a hair wider than the page renders in. */
export async function widenButtons(dialog: Locator, px: number): Promise<void> {
  await dialog.getByRole('button').evaluateAll(
    (buttons, extra) =>
      buttons.forEach((button) => {
        const own = getComputedStyle(button);
        (button as HTMLElement).style.paddingInline = `${parseFloat(own.paddingLeft) + extra}px ${parseFloat(own.paddingRight) + extra}px`;
      }),
    px,
  );
}
