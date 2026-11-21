import { expect, test, type Page } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// The render approval's pointer to an FX chain that is out of view ("2 effects above") is a chip floating over the bottom edge of the dialog's body. It takes no room: when it
// appears or goes, the popup, the body, the action row and every button are where they were, at every window size. As a third button in the action row it wrapped the row onto a
// second line the moment the chain's first effect left the view, and the body lost 42 px (67 to 109 px of row at 320x422 and 400x418; 49 to 93 px at 400 px tall; #3605 item 4).

/** The open approval's popup, body, action row and buttons, as rounded boxes, and how far the body scrolls. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const popup = document.querySelector('[role="alertdialog"]')!;
    const all = [...popup.querySelectorAll('button')];
    const row = all[all.length - 1]!.closest('.border-t')!;
    const body = row.previousElementSibling as HTMLElement;
    // The header's Close and the action row's buttons: what is in the body scrolls with it.
    const actions = all.filter((button) => !body.contains(button));
    const box = (el: Element) => {
      const at = el.getBoundingClientRect();
      return [at.left, at.top, at.width, at.height].map(Math.round).join(',');
    };
    return {
      popup: box(popup),
      body: box(body),
      row: box(row),
      buttons: actions.map(box),
      scrollHeight: body.scrollHeight,
      rowHeight: Math.round(row.getBoundingClientRect().height),
      bodyHeight: Math.round(body.getBoundingClientRect().height),
    };
  });

const chip = (page: Page) => page.getByRole('alertdialog').locator('[data-chain-pointer] button');
/** Scrolls the body and the chain's own list so the chain's first effect is in view (`top`) or out of it (`end`). */
const scrollChain = (page: Page, to: 'top' | 'end') =>
  page.evaluate((where) => {
    const popup = document.querySelector('[role="alertdialog"]')!;
    for (const el of popup.querySelectorAll<HTMLElement>('*'))
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = where === 'top' ? 0 : el.scrollHeight;
  }, to);
const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// A two-effect chain never leaves the view in a large window, so those sizes use the 23-effect chain.
const SIZES: [number, number, 'to-spec-approve-daw' | 'to-spec-approve-long-chain'][] = [
  [275, 420, 'to-spec-approve-daw'],
  [320, 400, 'to-spec-approve-daw'],
  [320, 401, 'to-spec-approve-daw'],
  [320, 422, 'to-spec-approve-daw'],
  [320, 436, 'to-spec-approve-daw'],
  [360, 500, 'to-spec-approve-daw'],
  [400, 400, 'to-spec-approve-daw'],
  [400, 418, 'to-spec-approve-daw'],
  [480, 420, 'to-spec-approve-daw'],
  [320, 300, 'to-spec-approve-long-chain'],
  [768, 1024, 'to-spec-approve-long-chain'],
  [1440, 900, 'to-spec-approve-long-chain'],
];

for (const [width, height, driver] of SIZES) {
  test(`Master / the approval's chain pointer takes no room when it appears or goes / ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers[driver]!(page);
    await page.setViewportSize({ width, height });
    await scrollChain(page, 'end');
    await expect(chip(page), 'the pointer shows once the first effect is out of view').toBeVisible();
    await frames(page);
    const shown = await layout(page);
    // It floats inside the body, whole, above the action row, and no button is under it.
    const placed = await page.evaluate(() => {
      const popup = document.querySelector('[role="alertdialog"]')!;
      const pointer = popup.querySelector('[data-chain-pointer] button')!.getBoundingClientRect();
      const all = [...popup.querySelectorAll('button')];
      const row = all[all.length - 1]!.closest('.border-t')!;
      const scroller = row.previousElementSibling!;
      const body = scroller.getBoundingClientRect();
      const actions = all.filter((button) => !scroller.contains(button));
      const covered = actions.filter((button) => {
        const at = button.getBoundingClientRect();
        return document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)?.closest('[data-chain-pointer]');
      }).length;
      const hit = document.elementFromPoint(pointer.left + pointer.width / 2, pointer.top + pointer.height / 2);
      return {
        inside: pointer.top >= body.top - 0.5 && pointer.bottom <= body.bottom + 0.5 && pointer.left >= body.left && pointer.right <= body.right,
        covered,
        onTop: Boolean(hit?.closest('[data-chain-pointer]')),
      };
    });
    expect(placed, 'the pointer is whole inside the body, on top there, and over no button').toEqual({ inside: true, covered: 0, onTop: true });

    // Pressing it brings the first effect into view, puts the keyboard on the chain's list and takes the pointer away, again with nothing else moving.
    await chip(page).click();
    await expect(chip(page)).toHaveCount(0);
    await expect(page.getByRole('alertdialog').getByRole('group', { name: 'FX chain this render runs' })).toBeFocused();
    await frames(page);
    expect(await layout(page), 'the popup, body, action row and buttons once the pointer has gone').toEqual(shown);
  });
}

// Every width a narrow or half-width window can have, at the heights on each side of the 400 px chrome change (320x400 included): the layout with the pointer showing is the
// layout once it has gone. One dialog, resized; the pointer is brought back at each size by scrolling the chain out of view.
test("Master / the approval's chain pointer takes no room at every width from 275 to 700 px", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await masterDrivers['to-spec-approve-daw']!(page);
  const problems: string[] = [];
  let compared = 0;
  for (const height of [400, 422]) {
    for (let width = 275; width <= 700; width += 5) {
      await page.setViewportSize({ width, height });
      await scrollChain(page, 'end');
      await frames(page);
      if ((await chip(page).count()) === 0) {
        problems.push(`${width}x${height}: no pointer with the chain scrolled out of view`);
        continue;
      }
      const shown = await layout(page);
      await chip(page).click();
      await expect(chip(page)).toHaveCount(0);
      await frames(page);
      const gone = await layout(page);
      compared += 1;
      if (JSON.stringify(gone) !== JSON.stringify(shown))
        problems.push(`${width}x${height}: with the pointer ${JSON.stringify(shown)}, without ${JSON.stringify(gone)}`);
    }
  }
  expect(problems).toEqual([]);
  expect(compared).toBe(172);
});

// What the pointer may cover inside the body (qa on #3870). At the body's scroll end the last file's row is whole above it: the dialog keeps a constant room under its last list.
for (const [width, height, driver] of [
  [320, 400, 'to-spec-approve-daw'],
  [320, 436, 'to-spec-approve-daw'],
  [320, 400, 'to-spec-approve-many'],
  [768, 1024, 'to-spec-approve-long-chain'],
  [1440, 900, 'to-spec-approve-long-chain'],
] as const) {
  test(`Master / the approval's chain pointer leaves the last file row readable at the scroll's end / ${driver} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers[driver]!(page);
    await page.setViewportSize({ width, height });
    await scrollChain(page, 'end');
    await expect(chip(page)).toBeVisible();
    await frames(page);
    const covered = await page.evaluate(() => {
      const popup = document.querySelector('[role="alertdialog"]')!;
      const pointer = popup.querySelector('[data-chain-pointer] button')!.getBoundingClientRect();
      const row = [...popup.querySelectorAll('table')].pop()!.querySelector('tbody tr:last-child')!;
      const range = document.createRange();
      range.selectNodeContents(row);
      return [...range.getClientRects()].filter(
        (text) =>
          text.width > 0 && text.bottom > pointer.top + 0.5 && text.top < pointer.bottom - 0.5 && text.right > pointer.left && text.left < pointer.right,
      ).length;
    });
    expect(covered, "boxes of the last file row's text under the pointer").toBe(0);
  });
}

// A control in the body that takes the keyboard is not left under the pointer: the body is about 100 px tall at these sizes and the pointer takes its lower third.
for (const [width, height, driver] of [
  [275, 300, 'to-spec-approve-no-fx'],
  [320, 300, 'to-spec-approve-long-chain'],
  [360, 300, 'to-spec-approve-chain-off'],
] as const) {
  test(`Master / Tab never leaves the keyboard on a control under the approval's chain pointer / ${driver} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers[driver]!(page);
    await page.setViewportSize({ width, height });
    await frames(page);
    const under: string[] = [];
    let inBody = 0;
    for (let tabs = 0; tabs < 10; tabs += 1) {
      await page.keyboard.press('Tab');
      await frames(page);
      const found = await page.evaluate(() => {
        const el = document.activeElement;
        const popup = document.querySelector('[role="alertdialog"]')!;
        const all = [...popup.querySelectorAll('button')];
        const body = all[all.length - 1]!.closest('.border-t')!.previousElementSibling!;
        if (!(el instanceof HTMLElement) || !body.contains(el) || el === body || el.closest('[data-chain-pointer]')) return null;
        const at = el.getBoundingClientRect();
        const frame = body.getBoundingClientRect();
        // Where the control's focus is seen: its own middle for a button, the top of what shows of a list.
        const y = Math.min(Math.max(at.top + Math.min(at.height / 2, 8), frame.top + 1), frame.bottom - 1);
        const hit = document.elementFromPoint(at.left + Math.min(at.width / 2, 20), y);
        return { name: el.getAttribute('aria-label') ?? el.tagName, under: Boolean(hit?.closest('[data-chain-pointer]')) };
      });
      if (!found) continue;
      inBody += 1;
      if (found.under) under.push(found.name);
    }
    expect(inBody, 'Tab reached the controls in the body').toBeGreaterThanOrEqual(3);
    expect(under).toEqual([]);
  });
}

// The step itself: as the window gets shorter one pixel at a time the action row keeps its height on each side of the 400 px chrome change, and the body never jumps.
for (const width of [275, 320, 360, 400, 480, 640]) {
  test(`Master / the approval's action row and body do not step as the window shrinks / ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['to-spec-approve-daw']!(page);
    const problems: string[] = [];
    let last: { height: number; rowHeight: number; bodyHeight: number } | undefined;
    for (let height = 440; height >= 380; height -= 1) {
      await page.setViewportSize({ width, height });
      await frames(page);
      const { rowHeight, bodyHeight } = await layout(page);
      // 400 px is where the dialog's compact chrome starts (a rule of `Dialog`, not of the pointer), so that one step is not compared.
      if (last && height !== 400) {
        if (rowHeight !== last.rowHeight) problems.push(`${width}x${height}: the action row is ${rowHeight} px, ${last.rowHeight} px at ${last.height}`);
        if (Math.abs(bodyHeight - last.bodyHeight) > 2)
          problems.push(`${width}x${height}: the body is ${bodyHeight} px, ${last.bodyHeight} px at ${last.height}`);
      }
      last = { height, rowHeight, bodyHeight };
    }
    expect(problems).toEqual([]);
  });
}
