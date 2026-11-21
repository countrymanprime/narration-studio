// The Booth footer's voice hints in a cold read (#3430, follow-up): a cold read needs no voice, so the voice keys do nothing there. Their hints stay listed,
// struck through (a lowered opacity fails axe's contrast rule), so the footer keeps its size and rows; they are plain again in Record mode.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

async function openBooth(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?mockVoiceFolders=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(page.getByRole('button', { name: /^Record$/ })).toBeEnabled();
}

const hints = (page: Page) => page.locator('#bkeys');
const voiceHints = (page: Page) => page.locator('#hint-booth\\.voice\\.0, #hint-booth\\.voice\\.prev, #hint-booth\\.voice\\.list');

async function setMode(page: Page, mode: 'Record' | 'Cold read'): Promise<void> {
  await page.getByRole('button', { name: 'Record options' }).click();
  await page.getByRole('radio', { name: mode }).click();
  await page.keyboard.press('Escape');
  // The popover has to be gone before the next key: a voice key pressed while it is still closing did not reach the Booth in 3 of 40 runs.
  await expect(page.getByRole('radio', { name: mode })).toBeHidden();
}

const box = (page: Page) => hints(page).evaluate((el) => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }));

for (const width of [1440, 1100, 768]) {
  test(`at ${width}: the voice hints are struck in a cold read and the footer keeps its size`, async ({ page }) => {
    await openBooth(page, width);
    await expect(voiceHints(page)).toHaveCount(3);
    const before = await box(page);
    for (const hint of await voiceHints(page).all()) expect(await hint.getAttribute('data-off')).toBeNull();
    await setMode(page, 'Cold read');
    for (const hint of await voiceHints(page).all()) {
      expect(await hint.getAttribute('data-off')).toBe('');
      expect(await hint.locator('span.line-through').evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through');
      expect(await hint.getAttribute('title')).toBe('A cold read needs no voice');
    }
    expect(await box(page)).toEqual(before);
    // The other hints are untouched.
    await expect(page.locator('#hint-reading\\.toggle')).not.toHaveAttribute('data-off', '');
    await setMode(page, 'Record');
    for (const hint of await voiceHints(page).all()) expect(await hint.getAttribute('data-off')).toBeNull();
  });
}

test('struck hints still pass the contrast rule (axe color-contrast on the hint bar), light and dark', async ({ page }) => {
  await openBooth(page);
  await setMode(page, 'Cold read');
  const source = readFileSync(createRequire(import.meta.url).resolve('axe-core'), 'utf8');
  await page.evaluate(source);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as { axe: { run: (context: string, options: object) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }
      ).axe;
      const result = await axe.run('#bkeys', { runOnly: ['color-contrast'] });
      return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`);
    });
    expect(violations, scheme).toEqual([]);
  }
});

test('Num . in a cold read opens no list and says why, like the other struck voice keys; in Record mode it opens the list', async ({ page }) => {
  await openBooth(page);
  await setMode(page, 'Cold read');
  await page.keyboard.press('NumpadDecimal');
  await expect(page.getByText('A cold read needs no voice. Choose Record to pick one.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Voices' })).toHaveCount(0);
  await setMode(page, 'Record');
  await page.keyboard.press('NumpadDecimal');
  await expect(page.getByRole('dialog', { name: 'Voices' })).toBeVisible();
});

test('a Record-mode footer has no struck hint', async ({ page }) => {
  await openBooth(page);
  await expect(hints(page).locator('[data-off]')).toHaveCount(0);
});
