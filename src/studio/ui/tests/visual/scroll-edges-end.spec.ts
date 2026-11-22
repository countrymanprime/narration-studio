// The scroll cue (`scroll-y-edges`, `scroll-x-edges` in styles.css) is gone where there is nothing more to scroll to, and is never drawn under the
// scroll bar (#3832). What the light theme hid and the dark theme's glow showed: a box at a fractional position (a centred dialog) kept one lit
// row at its bottom edge at the end of the scroll, brighter than the action row's rule. (The cue is also drawn across the bar's strip, where the
// cover cannot reach: a light block at both ends of the bar, which no CSS can avoid without knowing the bar's width; a follow-up has it.)
// The suite's browser hides scroll bars (Playwright's `--hide-scrollbars`); this file launches one that draws them, as the app's webview does.
// Each shot is compared with the same shot without the cue, so what is counted is what the cue drew and nothing else. The four counts of a box are
// soft, so a failure names every one that is wrong, not the first.
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchOptions } from '../../playwright.launch';
import { APP_DRIVERS } from './app.drivers';
import { settleFrames, settlePage } from './helpers/settle';

test.use({ colorScheme: 'dark', launchOptions: { ...launchOptions(), ignoreDefaultArgs: ['--hide-scrollbars'] } });

const WITHOUT_CUE = '.scroll-x-edges,.scroll-y-edges{background-image:none!important}';
// The cue fades over 0.75rem; a band this deep at an edge holds all of it.
const BAND = 16;
// A level or two is the rasteriser's noise between two shots; the cue's weakest row is further off the surface than this.
const CHANGED = 2;

type Axis = 'x' | 'y';
interface Shot {
  data: Buffer;
  width: number;
  height: number;
}
interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** The box in window pixels: its client area (what the content is clipped to) and its outer edge on the bar's side and at the far end. */
interface Geometry {
  left: number;
  top: number;
  clientRight: number;
  clientBottom: number;
  right: number;
  bottom: number;
  overflow: number;
}

async function shoot(page: Page): Promise<Shot> {
  await settleFrames(page);
  const { data, info } = await sharp(await page.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The shot as it is and the same shot with the cue taken away. */
async function withAndWithoutCue(page: Page): Promise<[Shot, Shot]> {
  const drawn = await shoot(page);
  const style = await page.addStyleTag({ content: WITHOUT_CUE });
  const bare = await shoot(page);
  await style.evaluate((node) => node.remove());
  return [drawn, bare];
}

function changed(a: Shot, b: Shot, x: number, y: number): boolean {
  const at = (y * a.width + x) * 3;
  return [0, 1, 2].some((channel) => Math.abs(a.data[at + channel] - b.data[at + channel]) > CHANGED);
}

/** How many rows (`y`) or columns (`x`) of the area the cue lit: a line counts when more than a quarter of its pixels changed. */
function litLines(drawn: Shot, bare: Shot, area: Area, axis: Axis): number {
  const x0 = Math.max(0, Math.ceil(area.x0));
  const y0 = Math.max(0, Math.ceil(area.y0));
  const x1 = Math.min(drawn.width, Math.ceil(area.x1));
  const y1 = Math.min(drawn.height, Math.ceil(area.y1));
  const perLine = new Map<number, number>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!changed(drawn, bare, x, y)) continue;
      const line = axis === 'y' ? y : x;
      perLine.set(line, (perLine.get(line) ?? 0) + 1);
    }
  }
  const lineLength = axis === 'y' ? x1 - x0 : y1 - y0;
  return [...perLine.values()].filter((count) => count > lineLength / 4).length;
}

async function geometry(box: Locator, axis: Axis): Promise<Geometry> {
  return box.evaluate((el: HTMLElement, along) => {
    const rect = el.getBoundingClientRect();
    const left = rect.left + el.clientLeft;
    const top = rect.top + el.clientTop;
    return {
      left,
      top,
      clientRight: left + el.clientWidth,
      clientBottom: top + el.clientHeight,
      right: rect.right,
      bottom: rect.bottom,
      overflow: along === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth,
    };
  }, axis);
}

/** The last BAND of the client area along the scroll, out to the box's own edge: where the cue of the far end is, and the row or column past the content. */
function endBand(box: Geometry, axis: Axis): Area {
  if (axis === 'y') return { x0: box.left + 1, x1: box.clientRight - 1, y0: box.clientBottom - BAND, y1: box.bottom };
  return { x0: box.clientRight - BAND, x1: box.right, y0: box.top + 1, y1: box.clientBottom - 1 };
}

async function scrollTo(box: Locator, axis: Axis, where: 'start' | 'end'): Promise<void> {
  await box.evaluate(
    (el: HTMLElement, [along, position]) => {
      const to = position === 'start' ? 0 : el.scrollHeight + el.scrollWidth;
      if (along === 'y') el.scrollTop = to;
      else el.scrollLeft = to;
    },
    [axis, where] as const,
  );
}

async function expectCueEndsWithTheScroll(page: Page, box: Locator, axis: Axis): Promise<void> {
  const measured = await geometry(box, axis);
  expect(measured.overflow, 'the box has more than both cues beyond its edge').toBeGreaterThan(4 * BAND);

  await scrollTo(box, axis, 'start');
  const [drawnAtStart, bareAtStart] = await withAndWithoutCue(page);
  expect.soft(litLines(drawnAtStart, bareAtStart, endBand(measured, axis), axis), 'at the start the far edge shows the cue').toBeGreaterThan(6);

  await scrollTo(box, axis, 'end');
  const [drawnAtEnd, bareAtEnd] = await withAndWithoutCue(page);
  expect
    .soft(litLines(drawnAtEnd, bareAtEnd, endBand(measured, axis), axis), 'rows or columns of the cue left at the far edge, at the end of the scroll')
    .toBe(0);
}

async function openAt(page: Page, drive: (page: Page) => Promise<void>, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await drive(page);
  // The dark theme is the one that shows a cue left behind: the light one's is the tone of the rule next to it.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width, height });
  // The pointer rests on nothing: a hovered row would change between the two shots' frames.
  await page.mouse.move(width - 3, height - 3);
  await settleFrames(page);
}

// Window sizes at which the dialog's body sits at a fractional height (the dialog is centred), which is where the lit row stayed.
const DIALOG_WINDOWS = [
  [1024, 768],
  [1100, 620],
  [1280, 720],
  [1366, 768],
] as const;

for (const [width, height] of DIALOG_WINDOWS) {
  test(`a dialog body scrolled to its end shows no cue, ${width} x ${height}`, async ({ page }) => {
    await openAt(page, APP_DRIVERS.engine['link-chapters-several'], width, height);
    const body = page.getByRole('dialog').last().locator('.scroll-y-edges').first();
    await expectCueEndsWithTheScroll(page, body, 'y');
  });
}

// Windows narrow enough for the rule table to scroll sideways.
const TABLE_WINDOWS = [
  [390, 844],
  [480, 800],
  [601, 700],
] as const;

for (const [width, height] of TABLE_WINDOWS) {
  test(`a table scrolled sideways to its end shows no cue, ${width} x ${height}`, async ({ page }) => {
    await openAt(page, APP_DRIVERS.master['file-rules'], width, height);
    const table = page.getByRole('group', { name: 'Chapter 01.wav, rule by rule, scroll area' });
    // Its bar is at its foot, which is what has to be in the shot.
    await table.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await expectCueEndsWithTheScroll(page, table, 'x');
  });
}
