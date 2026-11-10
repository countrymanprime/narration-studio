// A start chosen with Start from here is looked up in the host before the take begins (#3284). The lookup is made slow through the mock's overrides
// (`__NARRATION_MOCK_OVERRIDES__`), so these hold for any slow lookup, not only a slow disk: Record shows the wait at once and does not change the
// footer's size, presses join one lookup, and leaving the Booth while it or a later wait is out starts no take (REAPER recording with the narrator
// on another page, and no Stop button there).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { pastStartGuard } from './helpers/startGuard';

test.use({ viewport: { width: 1440, height: 900 } });

const LOOKUP_DELAY_MS = 2500;
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const lookups = (page: Page) => page.evaluate(() => (window as unknown as { __lookups: number }).__lookups);

/** Opens the Booth with a host whose punch lookup answers after `delay` ms (or never, with 0), counting each call in `window.__lookups`. */
async function openWithSlowLookup(page: Page, delay: number, modelCheckMs = 0): Promise<void> {
  await page.addInitScript(
    ([ms, modelMs]) => {
      const w = window as unknown as { __lookups: number; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
      w.__lookups = 0;
      w.__NARRATION_MOCK_OVERRIDES__ = {
        boothPunchTarget: () => {
          w.__lookups += 1;
          return ms === 0 ? new Promise(() => {}) : new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), ms));
        },
        ...(modelMs
          ? {
              assetsList: () =>
                new Promise((resolve) =>
                  setTimeout(
                    () => resolve({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }),
                    modelMs,
                  ),
                ),
            }
          : {}),
      };
    },
    [delay, modelCheckMs] as const,
  );
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

/** Right-click a phrase and choose Start from here: the start is marked and, with no take running, the press begins one (after the lookup). */
async function startFromHere(page: Page, word = 40): Promise<void> {
  await page.locator('[data-booth-text] [data-word]').nth(word).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
}

test('a slow lookup shows Record busy within 100 ms of the press, and five presses make one host call', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 100 });
  const before = await lookups(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
  }
  // Presses during the wait join it: no lookup beyond the one Start from here made.
  expect(await lookups(page)).toBe(before);
  expect(await dawRecording(page)).toBe(false);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  expect(await dawRecording(page)).toBe(true);
});

test('leaving the Booth while the lookup is out starts no take', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  // Past the answer: the host would have answered by now, and nothing may have begun.
  await page.waitForTimeout(LOOKUP_DELAY_MS + 800);
  expect(await dawRecording(page)).toBe(false);
});

test('a lookup that never answers ends with a sentence within 9 s, and the next Space works', async ({ page }) => {
  test.setTimeout(40_000);
  await openWithSlowLookup(page, 0);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/did not come back in time/).first()).toBeVisible({ timeout: 9000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
  // Not stuck: the next press is a new press and records (from the end of the audio, the start having been let go).
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 5000 });
  expect(await dawRecording(page)).toBe(true);
});

for (const [name, withStart] of [
  ['a plain press', false],
  ['a press with a start chosen', true],
] as const) {
  test(`leaving the Booth during a slow model check starts no take: ${name}`, async ({ page }) => {
    await openWithSlowLookup(page, 100, LOOKUP_DELAY_MS);
    if (withStart) await startFromHere(page);
    else await page.keyboard.press('Space');
    await expect(record(page)).toHaveAttribute('aria-busy', 'true');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
    await page.waitForTimeout(LOOKUP_DELAY_MS + 800);
    expect(await dawRecording(page)).toBe(false);
  });
}

// The pending look is the button's own colours and a spinner in the place of the mark: the footer, Record and the timer do not move or resize.
for (const [width, height] of [
  [320, 300],
  [360, 500],
  [600, 700],
  [1440, 900],
] as const) {
  test(`the footer, Record and the timer are the same size idle and pending at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openWithSlowLookup(page, LOOKUP_DELAY_MS);
    const measure = () =>
      page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = el?.getBoundingClientRect();
          return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null;
        };
        const footer = document.getElementById('brec')!.closest('div.flex-wrap')!.parentElement!;
        return {
          footer: Math.round(footer.getBoundingClientRect().height),
          record: box(document.getElementById('brec')),
          timer: box(document.getElementById('btimer')),
        };
      });
    const idle = await measure();
    // R chooses the phrase the reading is on and starts the take there: the same start as Start from here, from the keyboard, in a window too small for the menu.
    await page.keyboard.press('r');
    await expect(record(page)).toHaveAttribute('aria-busy', 'true');
    expect(await measure()).toEqual(idle);
  });
}

// A second Start from here on another phrase while a take is starting is refused with a sentence before it changes anything (#3320): no second
// lookup, the reading stays where the first press put it, and the take starts once, at the first press's spot. The next press works afterwards.
for (const [name, modelCheckMs, lookupMs] of [
  ['a slow model check', LOOKUP_DELAY_MS, 100],
  ['a slow lookup', 0, LOOKUP_DELAY_MS],
] as const) {
  test(`a second Start from here on another phrase during ${name} is refused and changes nothing`, async ({ page }) => {
    await openWithSlowLookup(page, lookupMs, modelCheckMs);
    const reading = () => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');
    await startFromHere(page, 40);
    await expect(record(page)).toHaveAttribute('aria-busy', 'true');
    const first = await reading();
    const lookupsBefore = await lookups(page);
    await page.waitForTimeout(500);
    await startFromHere(page, 160);
    await expect(page.getByText('A take is already starting, so that press was ignored.')).toBeVisible();
    expect(await lookups(page)).toBe(lookupsBefore);
    expect(await reading()).toBe(first);
    await expect(page.getByText(/Starting from/)).toHaveCount(1);
    await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
    expect(await lookups(page)).toBe(lookupsBefore);
    expect(await reading()).toBe(first);
    // The take is over: a Start from here on the other phrase is an ordinary press again.
    await pastStartGuard(page);
    await stop(page).click();
    await expect(record(page)).toBeEnabled();
    await startFromHere(page, 160);
    await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
    expect(await lookups(page)).toBe(lookupsBefore + 1);
    expect(await reading()).not.toBe(first);
  });
}

// The same for a plain Record press under way (no start chosen): a Start from here on any phrase meanwhile is refused and changes nothing.
test('a Start from here during a plain press with a slow model check is refused and changes nothing', async ({ page }) => {
  await openWithSlowLookup(page, 100, LOOKUP_DELAY_MS);
  const reading = () => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');
  const first = await reading();
  await page.keyboard.press('Space');
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(500);
  await startFromHere(page, 160);
  await expect(page.getByText('A take is already starting, so that press was ignored.')).toBeVisible();
  expect(await lookups(page)).toBe(0);
  expect(await reading()).toBe(first);
  await expect(page.getByText(/Starting from/)).toHaveCount(0);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  expect(await lookups(page)).toBe(0);
  expect(await reading()).toBe(first);
  await pastStartGuard(page);
  await stop(page).click();
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await startFromHere(page, 40);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  expect(await lookups(page)).toBe(1);
  expect(await reading()).not.toBe(first);
});
