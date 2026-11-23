// A toast whose text box scrolls loses the scrollbar's gutter (styles.css keeps one, `scrollbar-gutter: stable`, on every auto-scrolling box, and a gutter outlives `overflow: hidden`),
// so its text wraps to one more line than it would without. A box measured while it scrolled kept overflowing after what made it overflow was gone, such as a wider fallback font before the
// web font arrived (#4112). This spec uses the real gutter of the browser, with no stand-in and no dependence on font metrics: it finds a message that fits two lines without the gutter and not
// with it, raises it while the box is squeezed so it scrolls, and lifts the squeeze: the box must stop scrolling and drop out of the tab order.
import { expect, test, type Page } from '@playwright/test';
import { hookReady, raiseToast } from './helpers/raiseToast';

const PROSE =
  'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app to be sure it stopped, then record the take again from the top of the chapter, and check the take.';

const TEXT = '[data-toast-region] [data-toast-text]';

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/?mockNoProject=1');
  await hookReady(page);
}

const state = (page: Page) =>
  page.locator(TEXT).evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    tabIndex: (element as HTMLElement).tabIndex,
  }));

/** The longest prefix of the prose that fits the toast's two lines without the scrollbar's gutter and not with it, found in the real layout (a Retry toast with another waiting behind it). */
async function messageInTheGutterWindow(page: Page): Promise<string> {
  // A long message fills the box and scrolls, which is the state with the real gutter on it.
  await raiseToast(page, PROSE, 'Retry');
  await raiseToast(page, 'y', null);
  await expect(page.locator(TEXT)).toHaveText(PROSE);
  await expect.poll(async () => (await state(page)).overflowY).toBe('auto');
  const found = await page.locator(TEXT).evaluate((element, prose) => {
    const box = element as HTMLElement;
    // The box scrolls here, with the `overflow-y-auto` class's stable gutter: the width it has without a scrollbar is its full width, and the gutter is what the scrollbar takes.
    const free = box.offsetWidth;
    const gutter = box.offsetWidth - box.clientWidth;
    if (gutter <= 0) return { gutter, text: '' };
    const probe = document.createElement('span');
    probe.className = box.className;
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', maxHeight: 'none', overflowY: 'hidden', scrollbarGutter: 'auto' });
    box.parentElement!.append(probe);
    const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight);
    const lines = (text: string, width: number) => {
      probe.textContent = text;
      probe.style.width = `${width}px`;
      return Math.round(probe.scrollHeight / lineHeight);
    };
    let best = '';
    // Every length from 40 characters, so the 10 px window is found whatever the font (a word at a time is too coarse).
    for (let n = 40; n <= prose.length; n++) {
      const text = prose.slice(0, n).trimEnd();
      if (lines(text, free) <= 2 && lines(text, free - gutter) > 2) best = text;
    }
    probe.remove();
    return { gutter, text: best };
  }, PROSE);
  expect(found.gutter, 'this browser draws no scrollbar gutter on the toast, so the test proves nothing').toBeGreaterThan(0);
  expect(found.text, 'no message fits two lines without the gutter and not with it at this width').not.toBe('');
  return found.text;
}

test('a toast text that scrolled stops scrolling once it fits again, although it would not fit beside the scrollbar gutter', async ({ page }) => {
  await open(page);
  const message = await messageInTheGutterWindow(page);
  // Raised with room, the message fits and is plain text.
  await open(page);
  await raiseToast(page, message, 'Retry');
  await raiseToast(page, 'A second message waits behind it.', null);
  await expect(page.locator(TEXT)).toHaveText(message);
  await expect.poll(async () => (await state(page)).tabIndex).toBe(-1);
  // Raised while the box is squeezed, it overflows, scrolls, and takes the gutter.
  await open(page);
  const squeeze = await page.addStyleTag({ content: `${TEXT} { max-width: 80px !important; }` });
  await raiseToast(page, message, 'Retry');
  await raiseToast(page, 'A second message waits behind it.', null);
  await expect(page.locator(TEXT)).toHaveText(message);
  await expect.poll(async () => (await state(page)).tabIndex).toBe(0);
  expect((await state(page)).overflowY).toBe('auto');
  // The squeeze goes: the message fits the box again (it did when it was raised with room), so the box stops scrolling and is no tab stop.
  await squeeze.evaluate((element) => element.remove());
  await expect.poll(async () => (await state(page)).tabIndex).toBe(-1);
  expect((await state(page)).overflowY).toBe('hidden');
});
