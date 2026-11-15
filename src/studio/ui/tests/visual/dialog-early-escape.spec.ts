import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// #3500: the control that opens a dialog by keyboard shows its hint while it has focus, and the hint stays in the page for a moment after focus moves
// into the dialog. The dialog took that hint for the one Escape was meant for and ignored the key. A hint on something behind the dialog is not the dialog's to answer.
//
// #3509: the first version of this spec sent Escape "soon enough" and then asked whether the hint was still there, which is a time window: on a slow or a fast machine the hint
// had expired (or never drawn) and the spec failed on main. Now the precondition is made true by state and checked:
//  - before the key, the opener's hint is showing (asserted, so the test waits for it, however long that takes);
//  - the hint leaves on a timer that the dialog's render queues behind (measured: it goes about 25 ms after focus moves at normal speed, and later still under the CPU throttle,
//    and it has no exit animation to hold), so Escape is sent from a microtask of the first focus that lands in the dialog: after the effects of that React commit have run
//    (the dialog is listening), before any timer can run, so the hint is in the page whatever the machine's speed, and its presence is recorded at that moment.
// Not through `settlePage`, which changes the timing the page runs at. The same specs run with the CPU 20x slower, where the race showed in #3498.
const HINT = '[data-hint-popup]';

type Probe = { hintAtEscape?: boolean };

/** On the first focus that lands inside a dialog: records whether a hint is in the page, and sends Escape from that dialog element in a microtask (see above). */
async function sendEscapeWhenFocusLandsInADialog(page: Page): Promise<void> {
  await page.evaluate((hint) => {
    const probe: Probe = {};
    (window as unknown as { probe?: Probe }).probe = probe;
    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[role="dialog"]')) return;
        queueMicrotask(() => {
          probe.hintAtEscape = document.querySelector(hint) !== null;
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        });
      },
      { capture: true, once: true },
    );
  }, HINT);
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => (window as unknown as { probe: Probe }).probe);
}

async function throttleCpu(context: BrowserContext, page: Page, rate: number): Promise<void> {
  if (rate > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
}

for (const throttle of [1, 20]) {
  for (const [name, key] of [
    ['the jump menu', 'Control+k'],
    ['the shortcut sheet', 'Shift+?'],
  ] as const) {
    test(`Escape sent as soon as ${name} has focus closes it, with the opener's hint still showing, with the CPU ${throttle}x slower`, async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await throttleCpu(context, page, throttle);
      await page.setViewportSize({ width: 1100, height: 700 });
      await page.goto('/');
      const opener = page.getByRole('button', { name: /Jump to or run/ }).first();
      await opener.waitFor({ timeout: 40_000 });
      // The page settling after load, before the first focus.
      await page.waitForTimeout(1500);
      await opener.focus();
      // The precondition, by state: the opener has focus and its hint is showing. The hint is read again in the handler at the moment Escape is sent.
      await expect(opener).toBeFocused();
      await expect(page.locator(HINT)).toHaveCount(1, { timeout: 20_000 });
      await sendEscapeWhenFocusLandsInADialog(page);
      await page.keyboard.press(key);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
      const result = await probe(page);
      expect(result.hintAtEscape, "the opener's hint was showing when Escape came").toBe(true);
    });
  }

  // The same early Escape with an info icon's note on the page behind the dialog, opened by resting the mouse on the icon. The note belongs to the icon, not to the dialog.
  test(`Escape sent as soon as the jump menu has focus closes it, with an info icon's note from the mouse still showing, with the CPU ${throttle}x slower`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await throttleCpu(context, page, throttle);
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    await page
      .getByRole('button', { name: /Jump to or run/ })
      .first()
      .waitFor({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    const info = page.getByRole('button', { name: 'About the Rec. column' }).first();
    await info.scrollIntoViewIfNeeded();
    const box = (await info.boundingBox())!;
    await page.mouse.move(box.x - 30, box.y - 30);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    // The precondition, by state: the icon's note is showing.
    await expect(page.locator(HINT)).toHaveCount(1, { timeout: 20_000 });
    await sendEscapeWhenFocusLandsInADialog(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
    const result = await probe(page);
    expect(result.hintAtEscape, "the icon's note was showing when Escape came").toBe(true);
  });
}
