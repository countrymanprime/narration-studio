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
  // The narrator is reading it with the keyboard: the text has focus.
  await page.locator(TEXT).focus();
  // The squeeze goes: the message fits the box again (it did when it was raised with room), so the box stops scrolling and is no tab stop.
  await squeeze.evaluate((element) => element.remove());
  await expect.poll(async () => (await state(page)).tabIndex).toBe(-1);
  expect((await state(page)).overflowY).toBe('hidden');
  // The text that had focus stopped being a Tab stop: focus went to the toast's own Retry, not to the page.
  await expect(page.locator('[data-toast-region]').getByRole('button', { name: 'Retry' })).toBeFocused();
});

/** What a prose prefix of each length needs in the box as it is now: the lines at the box's full width and at the width left beside the gutter. */
async function linesPerLength(page: Page): Promise<{ free: number; gutter: number; lines: Array<{ n: number; full: number; narrow: number }> }> {
  return page.locator(TEXT).evaluate((element, prose) => {
    const box = element as HTMLElement;
    const free = box.offsetWidth;
    const gutter = box.offsetWidth - box.clientWidth;
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
    const result = [];
    for (let n = 40; n <= prose.length; n++) {
      const text = prose.slice(0, n).trimEnd();
      result.push({ n, full: lines(text, free), narrow: lines(text, free - gutter) });
    }
    probe.remove();
    return { free, gutter, lines: result };
  }, PROSE);
}

/** A page whose web fonts are held until `release()` is called, so what it draws is laid out in the fallback font first. */
async function openWithFontsHeld(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/*.woff2', async (route) => {
    await held;
    await route.continue();
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/?mockNoProject=1', { waitUntil: 'domcontentloaded' });
  await hookReady(page);
  return release;
}

test('a toast raised while the web fonts are held stops scrolling once they have loaded', async ({ browser }) => {
  // First page: what each prose prefix needs in the fallback font while the fonts are held, and in the web font once they have loaded.
  const probePage = await browser.newPage();
  const releaseProbe = await openWithFontsHeld(probePage);
  await raiseToast(probePage, PROSE, 'Retry');
  await raiseToast(probePage, 'y', null);
  await expect(probePage.locator(TEXT)).toHaveText(PROSE);
  await expect.poll(async () => (await state(probePage)).overflowY).toBe('auto');
  const fallback = await linesPerLength(probePage);
  releaseProbe();
  await probePage.evaluate(() => document.fonts.ready);
  const web = await linesPerLength(probePage);
  await probePage.close();
  expect(web.gutter, 'this browser draws no scrollbar gutter on the toast, so the test proves nothing').toBeGreaterThan(0);
  // A prefix that needs three lines in the fallback font (so it scrolls when raised there), fits two lines in the web font at full width, and would wrap to three beside the gutter: the case where a
  // box measured while it scrolls stays scrolling after the fonts load.
  const candidates = fallback.lines.filter((row, index) => {
    const after = web.lines[index];
    return row.full > 2 && after !== undefined && after.full <= 2 && after.narrow > 2;
  });
  test.skip(candidates.length === 0, 'no message wraps to three lines in the fallback font and fits two in the web font beside the gutter at this width');
  const chosen = candidates[Math.floor(candidates.length / 2)];
  const message = PROSE.slice(0, chosen?.n).trimEnd();
  // Second page: the message is raised while the fonts are held (it scrolls), then they load (it must stop).
  const page = await browser.newPage();
  const release = await openWithFontsHeld(page);
  await raiseToast(page, message, 'Retry');
  await raiseToast(page, 'A second message waits behind it.', null);
  await expect(page.locator(TEXT)).toHaveText(message);
  await expect.poll(async () => (await state(page)).tabIndex).toBe(0);
  expect((await state(page)).overflowY).toBe('auto');
  release();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await state(page)).tabIndex).toBe(-1);
  expect((await state(page)).overflowY).toBe('hidden');
  await page.close();
});
