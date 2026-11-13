import { expect, test } from '@playwright/test';

// #3416 item 41: at 320x300 the Check recordings footer sat below the dialog (Cancel and "Check N chapters" at y 219-255 in a dialog ending at y 207), clipped by
// it, so a real click did nothing and a focus ring was never seen. The body now scrolls as one area in a short window, so the footer is reached by scrolling
// (or by Tab, which scrolls it in) and a real mouse press on it starts the check.
// Heights from 300 up to the single-scroll breakpoint (36rem = 576 px), 420 and 500 included: the nested list used to come back one pixel above the old 400 px mark with 24-143 px.
for (const height of [300, 420, 500]) {
  test(`Check recordings at 320x${height}: the footer buttons come inside the dialog when reached, and a real click starts the check`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height });
    await page.goto('/');
    await page
      .getByRole('button', { name: /Check recordings/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Check recordings' });
    await dialog.waitFor({ timeout: 20_000 });
    // The chapters to tick sit in a list; at 320x300 it was squeezed to 0 px, so no row could be seen or pressed however it was scrolled.
    const firstChapter = dialog.getByRole('checkbox').first();
    await firstChapter.scrollIntoViewIfNeeded();
    // The nearest scroll area around the first chapter must have room to show rows: 0 px was the defect.
    const room = await firstChapter.evaluate((box) => {
      for (let node = box.parentElement; node && node.getAttribute('role') !== 'dialog'; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node.clientHeight;
      }
      return Infinity;
    });
    expect(room, 'the scroll area around the chapters has room to show a row').toBeGreaterThanOrEqual(60);
    const run = dialog.getByRole('button', { name: /^Check \d+ chapters?$/ });
    await run.focus();
    const inside = await page.evaluate(() => {
      const popup = document.querySelector('[role=dialog]') as HTMLElement;
      const box = popup.getBoundingClientRect();
      return [...popup.querySelectorAll('button')]
        .filter((button) => /^(Cancel|Check \d+ chapters?)$/.test(button.textContent?.trim() ?? ''))
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return rect.top >= box.top && rect.bottom <= box.bottom;
        });
    });
    expect(inside.length).toBe(2);
    expect(inside, 'Cancel and the run button are inside the dialog once the footer is reached').toEqual([true, true]);
    const target = await run.boundingBox();
    await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);
    await expect(dialog.getByRole('button', { name: /Stop checking/ })).toBeVisible({ timeout: 10_000 });
  });
}

// qa-breaker B1 and B3 on this change: the body is one scroll area that stays mounted across views, so a view must start at its top (Stop checking in
// sight), and the footer stays in sight while the list scrolls (with thousands of chapters it was thousands of pixels away).
test('Check recordings at 320x300: the footer stays in sight, and the running view starts at its top after a press far down the form', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto('/');
  await page
    .getByRole('button', { name: /Check recordings/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Check recordings' });
  await dialog.waitFor({ timeout: 20_000 });
  const run = dialog.getByRole('button', { name: /^Check \d+ chapters?$/ });
  const within = (name: string | RegExp) =>
    page.evaluate(
      (source) => {
        const popup = document.querySelector('[role=dialog]') as HTMLElement;
        const box = popup.getBoundingClientRect();
        const regex = new RegExp(source);
        const target = [...popup.querySelectorAll('button')].find((button) => regex.test(button.textContent?.trim() ?? ''));
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return rect.top >= box.top && rect.bottom <= box.bottom;
      },
      typeof name === 'string' ? name : name.source,
    );
  // At the top of the form, with the list unscrolled, the run button is already in sight (the footer sticks to the dialog's bottom).
  expect(await within(/^Check \d+ chapters?$/), 'the run button is in sight without scrolling').toBe(true);
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: /Stop checking/ })).toBeVisible({ timeout: 10_000 });
  expect(await within(/Stop checking/), 'Stop checking is inside the dialog, not scrolled out above it').toBe(true);
});

// ux review: the sticky footer must not sit over a control that has keyboard focus (the focus ring was the original #3416 item 41 complaint).
for (const size of [
  { width: 800, height: 500 },
  { width: 320, height: 300 },
]) {
  test(`Check recordings at ${size.width}x${size.height}: Tab never leaves the focused control under the footer`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Check recordings/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Check recordings' });
    await dialog.waitFor({ timeout: 20_000 });
    const covered: string[] = [];
    for (let step = 0; step < 45; step += 1) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const focused = document.activeElement as HTMLElement | null;
        if (!focused || !focused.closest('[role=dialog]')) return null;
        const rect = focused.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return top === focused || focused.contains(top) || top?.closest('label') === focused.closest('label')
          ? null
          : (focused.getAttribute('aria-label') ?? focused.textContent ?? focused.tagName).trim().slice(0, 40);
      });
      if (hidden) covered.push(`${step}: ${hidden}`);
    }
    expect(covered, 'controls covered by the sticky footer when focused').toEqual([]);
  });
}
