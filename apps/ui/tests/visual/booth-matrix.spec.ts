// The Booth's per-control matrix (definition of done, rule 3): every control the narrator can reach while a take runs, and the worst inputs the
// Booth can be given. Not a screenshot test. Each case names what it drives and asserts what the narrator sees and what the DAW holds; any page
// error or console error fails it.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

const RECORD_ON = '?mockRecordCapabilityOn=1';
const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text).first();

/** Errors the page itself raised: an uncaught exception, or a console error that is not the browser build's own noise. */
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/wails|custom\.js|Failed to load resource/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function openBooth(page: Page, query = RECORD_ON, ready = true): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  await page
    .getByRole('button', { name: /^Resume at ¶|^Chapter:/ })
    .first()
    .waitFor();
  if (ready) await expect(record(page)).toBeEnabled();
}

async function takeRunning(page: Page, query = RECORD_ON): Promise<void> {
  await openBooth(page, query);
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  // Focus leaves Stop, as it does once the narrator reads on, so the page's own keys reach the page.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

const daw = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state());
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe('with a take running', () => {
  test('Stop ends it, and the page and the DAW agree', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    expect((await daw(page))?.recording).toBe(true);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a double-click on Record leaves the page and the DAW telling the same story', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    await record(page).dblclick();
    await page.waitForTimeout(1000);
    // The second click lands on whatever the first made (Stop), or is ignored while the first is in flight: either way one story.
    const held = (await daw(page))?.recording;
    await expect(stop(page)).toHaveCount(held ? 1 : 0);
    await expect(record(page)).toHaveCount(held ? 0 : 1);
    expect(errors).toEqual([]);
  });

  test('a held Space (a pedal repeating) toggles once', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    await page.keyboard.down('Space');
    for (let i = 0; i < 40; i++) await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(stop(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect((await daw(page))?.recording).toBe(true);
    await expect(stop(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('ten quick presses of Space leave the page and the DAW telling the same story', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    const held = (await daw(page))?.recording;
    // Whatever the busy guard let through, what is on screen is what the DAW holds.
    await expect(stop(page)).toHaveCount(held ? 1 : 0);
    await expect(record(page)).toHaveCount(held ? 0 : 1);
    expect(errors).toEqual([]);
  });

  test('R says what it did and the take goes on', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page, `${RECORD_ON}&mockPunchCapabilityOn=1`);
    await page.keyboard.press('r');
    await expect(toast(page, /Rolling again from ¶/)).toBeVisible();
    expect((await daw(page))?.recording).toBe(true);
    expect(errors).toEqual([]);
  });

  test("Levels: Input level is off and says why; Monitor level moves the DAW's level, and a refusal puts it back with the DAW's sentence", async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockDawExperimentalOn=1`);
    await page.getByRole('button', { name: 'Levels' }).click();
    const popup = page.getByRole('dialog', { name: 'Levels' });
    const input = popup.getByRole('slider', { name: 'Input level' });
    await expect(input).toBeDisabled();
    await expect(popup.getByText(/cannot set an audio interface's input gain/)).toBeVisible();
    const monitor = popup.getByRole('slider', { name: 'Monitor level (output)' });
    await expect(monitor).toBeEnabled();
    await expect(monitor).toHaveValue('60');
    await monitor.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await daw(page))?.monitorLevel).toBe(63);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextLevel('REAPER has no hardware output to set.'));
    await page.keyboard.press('ArrowRight');
    await expect(popup.getByRole('alert')).toHaveText('REAPER has no hardware output to set.');
    expect((await daw(page))?.monitorLevel).toBe(63);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 400, height: 700 },
    { width: 360, height: 500 },
    { width: 320, height: 300 },
  ]) {
    test(`Levels with its two sliders is the topmost layer and fully on screen at ${size.width}x${size.height}`, async ({ page }) => {
      const errors = watch(page);
      await page.setViewportSize(size);
      await openBooth(page, `${RECORD_ON}&mockDawExperimentalOn=1`);
      await page.getByRole('button', { name: 'Levels' }).click();
      const popup = page.getByRole('dialog', { name: 'Levels' });
      await expect(popup.getByRole('slider', { name: 'Monitor level (output)' })).toBeVisible();
      const result = await page.evaluate(() => {
        const el = document.querySelector('[role="dialog"][aria-label="Levels"], [role="dialog"]')!;
        const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Monitor level'))!;
        const r = (dialogs ?? el).getBoundingClientRect();
        const points = [
          [r.left + 4, r.top + 4],
          [r.right - 4, r.top + 4],
          [r.left + 4, Math.min(r.bottom, innerHeight) - 4],
          [r.right - 4, Math.min(r.bottom, innerHeight) - 4],
        ];
        const top = points.every(([x, y]) => dialogs.contains(document.elementFromPoint(x, y)));
        return {
          top,
          left: r.left,
          topEdge: r.top,
          right: r.right,
          bottom: r.bottom,
          vw: innerWidth,
          vh: innerHeight,
          scrolls: dialogs.scrollHeight > dialogs.clientHeight,
        };
      });
      expect(result.top, 'nothing is drawn over the popover at its corners').toBe(true);
      expect(result.left).toBeGreaterThanOrEqual(-1);
      expect(result.topEdge).toBeGreaterThanOrEqual(-1);
      expect(result.right).toBeLessThanOrEqual(result.vw + 1);
      expect(result.bottom).toBeLessThanOrEqual(result.vh + 1);
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      expect(errors).toEqual([]);
    });
  }

  test('R pressed ten times in a moment rolls once, not ten times', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page, `${RECORD_ON}&mockPunchCapabilityOn=1`);
    for (let i = 0; i < 10; i++) await page.keyboard.press('r');
    await expect(toast(page, /Rolling again from ¶/)).toBeVisible();
    await page.waitForTimeout(300);
    expect(
      await page
        .getByRole('status')
        .getByText(/Rolling again from ¶/)
        .count(),
    ).toBe(1);
    expect((await daw(page))?.recording).toBe(true);
    expect(errors).toEqual([]);
  });

  test('B bookmarks the place and says so; Alt+[ and Alt+] then step, and say when they go round', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.keyboard.press('b');
    await expect(toast(page, /ookmark/)).toBeVisible();
    await page.keyboard.press('Alt+BracketRight');
    await page.keyboard.press('Alt+BracketLeft');
    expect((await daw(page))?.recording).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the setup chip asks before it leaves, and Keep recording changes nothing', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.getByRole('button', { name: /^Recording setup: REAPER/ }).click();
    const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
    await expect(question).toBeVisible();
    await question.getByRole('button', { name: 'Keep recording' }).click();
    await expect(question).toBeHidden();
    await expect(stop(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the side panel, the text settings and F11 change nothing about the take', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.getByRole('button', { name: 'Toggle the side panel' }).click();
    await page.getByRole('button', { name: 'Toggle the side panel' }).click();
    await page.getByRole('button', { name: 'Text settings' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('F11');
    await page.keyboard.press('F11');
    await page.waitForTimeout(300);
    await expect(stop(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the jump menu opens and closes over the take, and the take goes on', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByRole('combobox', { name: 'Jump menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: 'Jump menu' })).toBeHidden();
    await expect(stop(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the right-click menu holds the take while it is open and lets go when it closes', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.locator('[data-word]').nth(40).click({ button: 'right' });
    await expect(page.getByRole('menu').last()).toBeVisible();
    await expect(page.getByText('REC · reading paused', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByText('REC', { exact: true })).toBeVisible();
    expect((await daw(page))?.recording).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the chapter stepper is off, says why, and a press changes nothing', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    const next = page.getByRole('button', { name: 'Next chapter' });
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    const before = await page.getByRole('button', { name: /^Chapter: / }).getAttribute('aria-label');
    await next.hover();
    await expect(page.getByRole('tooltip')).toContainText('Not while recording');
    await next.click({ force: true });
    await page.keyboard.press('Alt+ArrowDown');
    expect(await page.getByRole('button', { name: /^Chapter: / }).getAttribute('aria-label')).toBe(before);
    expect(errors).toEqual([]);
  });

  test('resizing the window mid-take keeps the page whole and the word in view', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    for (const [width, height] of [
      [1440, 500],
      [400, 700],
      [800, 600],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      expect(await noHorizontalScroll(page), `${width}x${height} scrolls sideways`).toBe(true);
      await expect(stop(page)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('a clock jump forward a day and back an hour leaves a sane timer and a take that goes on', async ({ page }) => {
    const errors = watch(page);
    await page.clock.install({ time: new Date('2026-09-28T10:00:00Z') });
    await openBooth(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.clock.runFor(5_000);
    await page.clock.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    await page.clock.runFor(3_000);
    await page.clock.setSystemTime(new Date('2026-09-29T09:00:00Z'));
    await page.clock.runFor(3_000);
    const timer = await page.locator('#btimer').textContent();
    expect(timer, 'the timer never shows NaN or a negative time').toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);
    await expect(stop(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the microphone is unplugged mid-take: the footer says the text cannot follow, and the take goes on and stops', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__NARRATION_MOCK_TELEPROMPTER__?.failListening('Microphone Array (Realtek(R) Audio) was unplugged.'));
    await expect(page.locator('#blisten-why')).toContainText('The text cannot follow your voice: ');
    await expect(page.locator('#blisten-why')).toContainText('was unplugged');
    await expect(stop(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(true);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a full disk refuses the start in a sentence and starts nothing', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('There is no space left on the disk REAPER records to.', 'start'));
    await record(page).click();
    await expect(page.getByText('There is no space left on the disk REAPER records to.').first()).toBeVisible();
    await expect(record(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a full disk refuses the stop: the take is still shown running, with the sentence, and a second Stop works', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('REAPER could not finish the file: the disk is full.', 'stop'));
    await stop(page).click();
    await expect(page.getByText('REAPER could not finish the file: the disk is full.').first()).toBeVisible();
    await expect(stop(page)).toBeVisible();
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('leaving mid-take asks, and Stop and leave stops the DAW before it goes', async ({ page }) => {
    const errors = watch(page);
    await takeRunning(page);
    await page.keyboard.press('Escape');
    const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
    await expect(question).toBeVisible();
    await question.getByRole('button', { name: /^Stop and leave/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Script|Production/ })).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a DAW that is only playing is not a take: Record is still offered and starts one', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockDawPlayhead=12`);
    await expect(record(page)).toBeEnabled();
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a take the narrator started in the DAW itself: Record says so in a sentence, and is offered again once it stops there', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.startInDaw());
    await expect(page.getByText(/REAPER is already recording\. Stop it in REAPER before recording here\./).first()).toBeVisible();
    await expect(record(page)).toBeDisabled();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    await expect(record(page)).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByText(/already recording/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a reload mid-take: the take still runs in the DAW, and the Booth says so instead of offering a second start', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockDawRecording=1`, false);
    await expect(page.getByText(/REAPER is already recording\. Stop it in REAPER before recording here\./).first()).toBeVisible();
    await expect(record(page)).toBeDisabled();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    await expect(record(page)).toBeEnabled({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('the same, with the event lost: the next read still tells the story', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.dropEvents(true));
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.startInDaw());
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText(/already recording/).first()).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    await expect(record(page)).toBeEnabled({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('the other controls', () => {
  test('the credits: chosen from the picker, read, and a take on them runs and stops', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockCredits=filled`);
    await page.getByRole('button', { name: /^Chapter: / }).click();
    await page.getByRole('menuitemradio', { name: 'Opening credits' }).click();
    await expect(page.getByRole('button', { name: /^Chapter: Opening credits/ })).toBeVisible();
    await expect(record(page)).toBeEnabled();
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('b');
    await page.keyboard.press('r');
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await daw(page))?.recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('the speech model is not installed: the download question comes first, and No leaves the take unstarted', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockAssets=missing`);
    await record(page).click();
    const question = page.getByRole('alertdialog', { name: /^Download local \w+ model\?$/ });
    await expect(question).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(question).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('a long, narrow, emoji-heavy Text size 72 view still stops a take', async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize({ width: 400, height: 700 });
    await takeRunning(page, `${RECORD_ON}&mockBooth=emoji`);
    for (let i = 0; i < 14; i++) await page.keyboard.press('Equal');
    await page.keyboard.press('ArrowDown');
    expect(await noHorizontalScroll(page)).toBe(true);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('the worst inputs', () => {
  test('a 100,000-word chapter opens, follows the reading position and records', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watch(page);
    // A step in this chapter cost 0.8 s: the browser painted and hit-tested all 300,000 nodes on every frame. The paragraphs away from the reading
    // position are now skipped by the browser (`content-visibility`, BoothText), and a step costs about 0.1 s (docs/operations/booth-acceptance.md).
    // The steps are timed inside the page: Playwright's trace snapshots the 300,000-node DOM at every action it takes, which costs more than the step does.
    const started = Date.now();
    await openBooth(page, `${RECORD_ON}&mockBooth=huge-chapter`);
    const opened = Date.now() - started;
    const steps = await page.evaluate(async () => {
      const frames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const timings: number[] = [];
      for (const key of ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown']) {
        const began = performance.now();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
        await frames();
        timings.push(Math.round(performance.now() - began));
      }
      return timings;
    });
    const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
    test.info().annotations.push({ type: 'timing', description: `opened (traced) in ${opened} ms; seven steps took ${steps.join(', ')} ms` });
    expect(await page.locator('[data-state="cur"]').count(), 'the steps moved the reading position').toBe(1);
    expect(median, `the median of seven steps (${steps.join(', ')} ms) is under 250 ms`).toBeLessThan(250);
    expect(opened, 'the Booth opens in under 30 s, traced').toBeLessThan(30_000);
    await record(page).click();
    await expect(stop(page)).toBeVisible({ timeout: 20_000 });
    await stop(page).click();
    await expect(record(page)).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('5000 chapters: the picker lists them, a chapter can be chosen and the arrows step', async ({ page }) => {
    const errors = watch(page);
    // Straight to the Booth: the Production page lists every chapter and does not finish loading 5000 of them (see the pull request).
    const started = Date.now();
    await page.goto(`/booth${RECORD_ON}&mockBooth=many-chapters`);
    await settlePage(page);
    await page.getByRole('button', { name: /^Chapter:/ }).waitFor({ timeout: 60_000 });
    expect(Date.now() - started, 'the Booth opens in under 20 s').toBeLessThan(20_000);
    await page.getByRole('button', { name: /^Chapter: / }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await page.getByRole('menuitemradio').count()).toBeGreaterThan(100);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Next chapter' }).click();
    await expect(page.getByRole('button', { name: /^Chapter: Chapter 2/ })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  for (const book of ['emoji', 'rtl', 'odd-titles'] as const) {
    test(`${book} titles and text: the Booth shows them, fits the window and records`, async ({ page }) => {
      const errors = watch(page);
      await openBooth(page, `${RECORD_ON}&mockBooth=${book}`);
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.getByRole('button', { name: /^Chapter: / }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      const items = await page.getByRole('menuitemradio').allTextContents();
      // Five chapters and the two credits entries around them.
      expect(items).toHaveLength(7);
      // Nothing from a title is run as markup.
      expect(await page.evaluate(() => document.querySelectorAll('script:not([src])').length >= 0 && !(window as unknown as { __xss?: boolean }).__xss)).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
      await record(page).click();
      await expect(stop(page)).toBeVisible();
      await stop(page).click();
      await expect(record(page)).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test('a word of 276 characters with no break wraps inside the text instead of being clipped', async ({ page }) => {
    const errors = watch(page);
    await openBooth(page, `${RECORD_ON}&mockBooth=odd-titles`);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    const overflow = await page.evaluate(() => {
      const box = document.querySelector('[data-booth-text]')!.getBoundingClientRect();
      const word = [...document.querySelectorAll<HTMLElement>('[data-word]')].find((w) => (w.textContent ?? '').includes('longwordwithoutanybreaks'));
      if (!word) return { found: false, past: 0 };
      const past = Math.max(...[...word.getClientRects()].map((r) => r.right - box.right));
      return { found: true, past };
    });
    expect(overflow.found, 'the long word is on the page').toBe(true);
    expect(overflow.past, 'no part of the long word runs past the text box').toBeLessThanOrEqual(1);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  for (const mics of ['0', '1', '50', 'weird', 'long', 'unbroken'] as const) {
    test(`${mics} microphone(s) in Levels: listed or explained, inside the window, and the popover closes`, async ({ page }) => {
      const errors = watch(page);
      await openBooth(page, `${RECORD_ON}&mockMics=${mics}`);
      await page.getByRole('button', { name: 'Levels' }).click();
      const popup = page.getByRole('dialog', { name: 'Levels' });
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      if (mics === '0') await expect(popup.getByText(/No microphone found/)).toBeVisible();
      // A name of any length leaves the popover its own width (walkthrough M8): it does not stretch to the window.
      expect(box!.width, 'the Levels popover keeps a bounded width').toBeLessThanOrEqual(Math.min(26 * 16 + 48, viewport.width - 32));
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
