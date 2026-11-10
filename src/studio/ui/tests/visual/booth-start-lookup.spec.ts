// A start chosen with Start from here is looked up in the host before the take begins (#3284). The lookup is made slow through the mock's
// overrides (`__NARRATION_MOCK_OVERRIDES__`), so these hold for any slow lookup, not only a slow disk: Record shows the wait at once, presses join one
// lookup, and leaving the Booth while it is out starts no take (REAPER recording with the narrator on another page, and no Stop button there).
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const LOOKUP_DELAY_MS = 2500;
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const lookups = (page: Page) => page.evaluate(() => (window as unknown as { __lookups: number }).__lookups);

/** Opens the Booth with a host whose punch lookup answers after `delay` ms (or never, with `delay` 0), counting each call in `window.__lookups`. */
async function openWithSlowLookup(page: Page, delay: number): Promise<void> {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __lookups: number; __NARRATION_MOCK_OVERRIDES__: unknown };
    w.__lookups = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: () => {
        w.__lookups += 1;
        return ms === 0 ? new Promise(() => {}) : new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), ms));
      },
    };
  }, delay);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

/** Right-click a phrase and choose Start from here: the start is marked and, with no take running, the press begins one (after the lookup). */
async function startFromHere(page: Page): Promise<void> {
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
}

test('a slow lookup shows Record busy within 100 ms of the press, and five presses make one host call', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 100 });
  // The chosen start is said beside Record while no take runs, and gone with the take: in the footer, so it shows with the side panel shut.
  await expect(
    page
      .locator('#btimer')
      .locator('xpath=..')
      .getByText(/^Looking up ¶ \d+…$/),
  ).toBeVisible();
  const before = await lookups(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
  }
  // Presses during the wait join it: no lookup beyond the one Start from here made.
  expect(await lookups(page)).toBe(before);
  expect(await dawRecording(page)).toBe(false);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  await expect(record(page)).toHaveCount(0);
  await expect(page.getByText(/^(Starts at|Looking up) ¶ /)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  await expect(page.getByText(/^(Starts at|Looking up) ¶ /)).toHaveCount(0);
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
  await expect(page.getByText(/Recording over/)).toHaveCount(0);
});

test('a lookup that never answers ends with a sentence and a Record that works again', async ({ page }) => {
  test.setTimeout(30_000);
  await openWithSlowLookup(page, 0);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 100 });
  await expect(page.getByText(/got no answer about where that passage was recorded/).first()).toBeVisible({ timeout: 12_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});

// The waits after the lookup (the speech model check, the project check, the start tone) outlast a narrator's stay just as well: a press whose
// Booth was left starts no take, with or without a chosen start. The model check is made slow here (`assetsList`); the rest is held by the Vitest
// page tests, which gate the project check and the tone.
for (const [name, withStart] of [
  ['a plain press', false],
  ['a press with a start chosen', true],
] as const) {
  test(`leaving the Booth during a slow model check starts no take: ${name}`, async ({ page }) => {
    await page.addInitScript((ms) => {
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
        assetsList: () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }),
              ms,
            ),
          ),
      };
    }, LOOKUP_DELAY_MS);
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    await showChapterTop(page);
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

test('after a refused lookup the start is dropped and the sentence says so', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: async () => ({ outcome: 'refused', message: 'The recording check is out of date.' }),
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await startFromHere(page);
  await expect(page.getByText(/out of date\. No start is chosen now: Record starts at the end of the recording/)).toBeVisible();
  await expect(page.getByText(/^(Starts at|Looking up) ¶ /)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(false);
});

test('a DAW that refuses at the end of the lookup leaves no "Recording over" message and no take', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('REAPER is not answering.', 'start'));
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true', { timeout: LOOKUP_DELAY_MS + 4000 });
  await expect(page.getByText(/Recording over/)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(false);
});

test('pending Record is described and announced, with a label that stays readable at 360x500', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  const button = record(page);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toHaveAttribute('aria-describedby', 'brec-pending');
  await expect(page.locator('#brec-pending[role="status"]')).toHaveText('Starting the take…');
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core') });
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: string, options: object) => Promise<{ violations: { id: string }[] }> } }).axe.run(
      '#brec',
      {
        runOnly: ['color-contrast'],
      },
    );
    return result.violations.map((v) => v.id);
  });
  expect(violations).toEqual([]);
  await expect(page.locator('#brec-pending')).toHaveText('', { timeout: LOOKUP_DELAY_MS + 4000 });
});

test('a take the DAW refuses after the lookup keeps the start and its chip, and the next Record uses it', async ({ page }) => {
  test.setTimeout(40_000);
  await openWithSlowLookup(page, 1500);
  await startFromHere(page);
  const chip = page.getByText(/^(Starts at|Looking up) ¶ \d+/);
  await expect(chip).toBeVisible();
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('REAPER is not answering.', 'start'));
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true', { timeout: 6000 });
  // The refusal is said, nothing claims a take over the passage, the start is still chosen and shown, and no take runs.
  await expect(page.getByText(/REAPER is not answering/).first()).toBeVisible();
  await expect(page.getByText(/Recording over/)).toHaveCount(0);
  await expect(chip).toBeVisible();
  expect(await dawRecording(page)).toBe(false);
  const before = await lookups(page);
  // The next press uses that start: it looks it up again and records from it; the chip goes with the take's end.
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 6000 });
  expect(await lookups(page)).toBe(before + 1);
  await expect(chip).toHaveCount(0);
  await pastStartGuard(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  await expect(chip).toHaveCount(0);
});

test('presses after the lookup, during a slow model check, ask the host nothing more and put no message up', async ({ page }) => {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __lookups: number; __NARRATION_MOCK_OVERRIDES__: unknown };
    w.__lookups = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: async () => {
        w.__lookups += 1;
        return { outcome: 'found', start: 12, end: 20 };
      },
      assetsList: () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }),
            ms,
          ),
        ),
    };
  }, LOOKUP_DELAY_MS);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  const before = await lookups(page);
  for (const key of ['Space', 'r', 'Space', 'r']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  expect(await lookups(page)).toBe(before);
  // The start is said once, by the chip beside Record; no message repeats it.
  await expect(page.locator('[data-tone]').filter({ hasText: /Starting from|Recording over/ })).toHaveCount(0);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  expect(await lookups(page)).toBe(before);
});

// The pending tip names the track and nothing else new: an unbroken, enormous name stays inside its popup, at a wide and a narrow window.
for (const [label, name, width, height] of [
  ['37 characters', 'x'.repeat(37), 1440, 900],
  ['10,000 characters', 'Ω😀é'.repeat(2500), 1440, 900],
  ['37 characters', 'x'.repeat(37), 320, 300],
  ['10,000 characters', 'Ω😀é'.repeat(2500), 320, 300],
] as const) {
  test(`the pending tip keeps a ${label} track name inside its popup at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      ([trackName, ms]) => {
        (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
          boothPunchTarget: async () => ({ outcome: 'found', trackName, start: 12, end: 20 }),
          assetsList: () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }),
                ms as number,
              ),
            ),
        };
      },
      [name, 6000] as const,
    );
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    await showChapterTop(page);
    await startFromHere(page);
    await expect(record(page)).toHaveAttribute('aria-busy', 'true');
    await record(page).hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('Recording over');
    const fit = await tip.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, text: el.textContent ?? '' }));
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    expect(fit.text).not.toMatch(/…\./);
    expect(fit.text).not.toContain('¶');
  });
}

// Data that comes and goes keeps a slot: the footer and Record do not move as the chip appears, changes and goes (measured, at two small windows).
for (const [width, height] of [
  [320, 300],
  [360, 500],
] as const) {
  test(`the footer, Record and the timer stand still across idle, Looking up, Starts at and gone at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(40_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript((ms) => {
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
        boothPunchTarget: () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), 1500)),
        assetsList: () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }),
              ms,
            ),
          ),
      };
    }, 2500);
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
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
    await expect(page.getByText(/^Looking up ¶ \d+…$/)).toBeVisible();
    const looking = await measure();
    await expect(page.getByText(/^Starts at ¶ \d+$/)).toBeVisible({ timeout: 4000 });
    const starts = await measure();
    await expect(stop(page)).toBeVisible({ timeout: 6000 });
    await pastStartGuard(page);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible();
    const gone = await measure();
    expect({ looking, starts, gone }).toEqual({ looking: idle, starts: idle, gone: idle });
  });
}
