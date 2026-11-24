// A toast whose text box scrolls loses the scrollbar's gutter (styles.css keeps one, `scrollbar-gutter: stable`, on every auto-scrolling box, and a gutter outlives `overflow: hidden`),
// so its text wraps to one more line than it would without. A box measured while it scrolled kept overflowing after what made it overflow was gone, such as a wider fallback font before the
// web font arrived, or a squeeze that was lifted (#4112). Both tests use the browser's real gutter (the font test also stands in for a wider fallback font with a fixed letter-spacing): they find in the page a message that fits two lines without the gutter and not
// with it, raise it while the box overflows, and expect the box to stop scrolling and drop out of the tab order once the cause is gone. The window is narrow (about the gutter's width), so the
// message is searched for in the real layout, and the font test searches across box widths too; neither skips: a browser with no such message fails them.
import { expect, test, type Browser, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Mock build only (`main.tsx`): undefined for a Retry button, null for none, a string for a button with that label. */
    __raiseToast?: (text: string, actionLabel?: string | null) => void;
  }
}

// A local copy of the hook's declaration and calls, the minimum this spec needs: it moves to the shared helper of #4118 once that lands.
const hookReady = (page: Page) => page.waitForFunction(() => typeof window.__raiseToast === 'function');
const raiseToast = (page: Page, text: string, label?: string | null) => page.evaluate((args) => window.__raiseToast?.(args.text, args.label), { text, label });

const PROSE =
  'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app to be sure it stopped, then record the take again from the top of the chapter, and check the take.';

const TEXT = '[data-toast-region] [data-toast-text]';

/** Stands in for a fallback font wider than the web font: a fixed letter-spacing on the toast text (about 20% wider text, more than the usual difference between two sans-serif fonts), with the same effect on the lines whatever fonts the machine has. */
const WIDE = `${TEXT} { letter-spacing: 0.12em !important; }`;

/** The web font the toast text is set in (`styles.css`). */
const FAMILY = '"IBM Plex Sans"';

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/?mockNoProject=1');
  await hookReady(page);
  await page.evaluate(() => document.fonts.ready);
}

const state = (page: Page) =>
  page.locator(TEXT).evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    tabIndex: (element as HTMLElement).tabIndex,
  }));

/** The box's width and the gutter its scrollbar takes (the box scrolls, so the stylesheet's stable gutter is on it). */
const boxAndGutter = (page: Page) =>
  page.locator(TEXT).evaluate((element) => {
    const width = element.getBoundingClientRect().width;
    return { width, gutter: width - element.clientWidth };
  });

type Row = { width: number; n: number; full: number; narrow: number };

/** What each prose prefix needs at each box width, as the page lays it out now: the lines at the width and at the width left beside the gutter. One probe, for every test. */
async function linesTable(page: Page, widths: number[], gutter: number): Promise<Row[]> {
  return page.locator(TEXT).evaluate(
    (element, args) => {
      const box = element as HTMLElement;
      const probe = document.createElement('span');
      probe.className = box.className;
      Object.assign(probe.style, {
        position: 'absolute',
        visibility: 'hidden',
        maxHeight: 'none',
        overflowY: 'hidden',
        scrollbarGutter: 'auto',
        letterSpacing: getComputedStyle(box).letterSpacing,
      });
      box.parentElement!.append(probe);
      const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight);
      const lines = (text: string, width: number) => {
        probe.textContent = text;
        probe.style.width = `${width}px`;
        return Math.round(probe.scrollHeight / lineHeight);
      };
      const rows: Row[] = [];
      for (const width of args.widths) {
        for (let n = 40; n <= args.prose.length; n++) {
          const text = args.prose.slice(0, n).trimEnd();
          rows.push({ width, n, full: lines(text, width), narrow: lines(text, width - args.gutter) });
        }
      }
      probe.remove();
      return rows;
    },
    { widths, gutter, prose: PROSE },
  );
}

/** A page whose web fonts are held until `release()`, so what it draws is laid out in the fallback font first; it asserts the hold took effect. */
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
  expect(
    await page.evaluate((family) => !document.fonts.check(`1em ${family}`), FAMILY),
    `the web font ${FAMILY} should be held, or the test proves nothing`,
  ).toBe(true);
  return () => {
    release();
  };
}

/** Runs `body` with a fresh page and closes it, with its routes, whatever happens. */
async function withPage(browser: Browser, body: (page: Page) => Promise<void>): Promise<void> {
  const page = await browser.newPage();
  try {
    await body(page);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
  }
}

test('a toast text that scrolled stops scrolling once it fits again, although it would not fit beside the scrollbar gutter', async ({ page }) => {
  await open(page);
  // A long message fills the box and scrolls: that is the state with the real gutter on it.
  await raiseToast(page, PROSE, 'Retry');
  await raiseToast(page, 'y', null);
  await expect(page.locator(TEXT)).toHaveText(PROSE);
  await expect.poll(async () => (await state(page)).overflowY).toBe('auto');
  const { width, gutter } = await boxAndGutter(page);
  expect(gutter, 'this browser draws no scrollbar gutter on the toast, so the test proves nothing').toBeGreaterThan(0);
  const rows = await linesTable(page, [width], gutter);
  const candidates = rows.filter((row) => row.full <= 2 && row.narrow > 2);
  expect(candidates.length, 'no message fits two lines without the gutter and not with it at this width').toBeGreaterThan(0);
  const chosen = candidates[Math.floor(candidates.length / 2)];
  expect(chosen).toBeDefined();
  const message = PROSE.slice(0, chosen?.n).trimEnd();
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
  // The text that had focus stopped being a Tab stop: focus went to the toast's Dismiss, not to the page and not to Retry (the narrator's next Space must not run an action they never chose).
  const region = page.locator('[data-toast-region]');
  await expect(region.getByRole('button', { name: 'Dismiss message' })).toBeFocused();
  // The mock's Retry does nothing the page can see, so what is asserted is where the next Space would land: on Dismiss, which only dismisses.
  await page.keyboard.press('Space');
  await expect(region.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('a toast raised while the web fonts are held stops scrolling once they have loaded', async ({ browser }) => {
  // First page: what each prose prefix needs at each box width in the fallback font while the fonts are held, and in the web font once they have loaded.
  let fallback: Row[] = [];
  let web: Row[] = [];
  let gutter = 0;
  let widths: number[] = [];
  await withPage(browser, async (probe) => {
    const release = await openWithFontsHeld(probe);
    await raiseToast(probe, PROSE, 'Retry');
    await raiseToast(probe, 'y', null);
    await expect(probe.locator(TEXT)).toHaveText(PROSE);
    await expect.poll(async () => (await state(probe)).overflowY).toBe('auto');
    const natural = await boxAndGutter(probe);
    gutter = natural.gutter;
    expect(gutter, 'this browser draws no scrollbar gutter on the toast, so the test proves nothing').toBeGreaterThan(0);
    // Box widths from its natural width downwards: a squeeze (max-width) sets them in the second page, as a narrower toast would.
    widths = Array.from({ length: 40 }, (_, step) => Math.floor(natural.width) - 3 * step);
    // The fallback font is made wider than the web font by a fixed letter-spacing while the fonts are held, so the precondition does not depend on which fonts the machine has (CI's fallback and
    // web fonts have other metrics than a developer's): the toast is laid out wide, then the spacing goes and the real web font loads.
    const wide = await probe.addStyleTag({ content: WIDE });
    fallback = await linesTable(probe, widths, gutter);
    await wide.evaluate((element) => element.remove());
    release();
    await probe.evaluate(() => document.fonts.ready);
    web = await linesTable(probe, widths, gutter);
  });
  // A (width, prefix) pair that needs three lines in the fallback font (so it scrolls when raised there), fits two lines in the web font at that width, and would wrap to three beside the gutter: the
  // case where a box measured while it scrolls stays scrolling after the fonts load.
  const webOf = new Map(web.map((row) => [`${row.width}:${row.n}`, row]));
  const pairs = fallback.filter((row) => {
    const after = webOf.get(`${row.width}:${row.n}`);
    return row.full > 2 && after !== undefined && after.full <= 2 && after.narrow > 2;
  });
  expect(
    pairs.length,
    `no (box width, message) pair wraps to three lines in the fallback font and fits two in the web font beside the gutter, at any of ${widths.length} widths`,
  ).toBeGreaterThan(0);
  test.info().annotations.push({
    type: 'pairs',
    description: `${pairs.length} (width, message) pairs at ${new Set(pairs.map((row) => row.width)).size} of ${widths.length} widths`,
  });
  const chosen = pairs[Math.floor(pairs.length / 2)];
  expect(chosen).toBeDefined();
  const message = PROSE.slice(0, chosen?.n).trimEnd();
  // Second page: the box is held at that width, the message is raised while the fonts are held (it scrolls), then they load (it must stop).
  await withPage(browser, async (page) => {
    const release = await openWithFontsHeld(page);
    await page.addStyleTag({ content: `${TEXT} { max-width: ${chosen?.width}px !important; }` });
    const wide = await page.addStyleTag({ content: WIDE });
    await raiseToast(page, message, 'Retry');
    await raiseToast(page, 'A second message waits behind it.', null);
    await expect(page.locator(TEXT)).toHaveText(message);
    await expect.poll(async () => (await state(page)).tabIndex).toBe(0);
    expect((await state(page)).overflowY).toBe('auto');
    // The wide spacing goes (the message now fits at that width) and the held fonts load: the real `loadingdone` is what makes the box measure again.
    const widthWhileWide = (await boxAndGutter(page)).width;
    await wide.evaluate((element) => element.remove());
    release();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => (await state(page)).tabIndex).toBe(-1);
    expect((await state(page)).overflowY).toBe('hidden');
    // The box did not change width on the way (a resize would make the ResizeObserver measure again without the fonts path being what did it).
    expect((await boxAndGutter(page)).width).toBeCloseTo(widthWhileWide, 0);
  });
});
