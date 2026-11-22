// Choosing an Analysis source by keyboard on a slow host keeps focus on the chips while the choice saves (#3995). A natively disabled chip drops
// focus to <body> in a real browser (jsdom does no focus fixup), so the chips stay focusable and say why they cannot be chosen.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

test('editing check: choosing a source by keyboard keeps focus in Analysis source', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      editingSetSourceChoice: (_chapterId: string, choice: string) => new Promise((resolve) => setTimeout(() => resolve(choice), 1500)),
    };
  });
  await page.goto('/');
  await settlePage(page);
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  await table.getByRole('row').nth(2).locator('td').nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Editing check…' }).click();
  const panel = page.getByRole('dialog', { name: /^Editing check: / });
  const group = panel.getByRole('group', { name: 'Analysis source' });
  const chip = group.getByRole('button').first();
  await chip.waitFor();
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const inGroup = () => page.evaluate(() => Boolean(document.activeElement?.closest('[aria-label="Analysis source"]')));
  expect(await inGroup(), 'focus left the chips while the choice saves').toBe(true);
  await page.waitForTimeout(2000);
  expect(await inGroup(), 'focus left the chips after the choice saved').toBe(true);
});
