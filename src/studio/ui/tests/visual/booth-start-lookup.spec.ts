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
      .getByText(/^Starts at ¶ \d+$/),
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
  await expect(page.getByText(/^Starts at ¶ /)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  await expect(page.getByText(/^Starts at ¶ /)).toHaveCount(0);
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

test('after a refused lookup the start is let go and the sentence says so', async ({ page }) => {
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
  await expect(page.getByText(/out of date\. The start is let go: Record now starts at the end of the recording/)).toBeVisible();
  await expect(page.getByText(/^Starts at ¶ /)).toHaveCount(0);
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
