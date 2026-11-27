// A narrator's right-to-left name inside a journal label reaches the toasts through the real journal (#4129 slice C): removing a milestone raises "Removed <name>." with Undo, and
// undoing it from the keys raises "Undid <label>". The label is built isolated (U+2068 … U+2069), so both toasts hold the name apart from the English round it and read left to right.
import { expect, test } from '@playwright/test';
import { addMilestone } from './drivers/schedule';
import { settlePage } from './helpers/settle';

const FSI = '\u2068';
const PDI = '\u2069';
const NAME = '\u0645\u0631\u062D\u0644\u0629 \u0627\u0644\u062A\u0633\u0644\u064A\u0645'; // "the delivery milestone", in Arabic

test('Schedule / a right-to-left milestone removed and undone: both toasts isolate its name', async ({ page }) => {
  await page.goto('/schedule?mockProduction=on-pace');
  await settlePage(page);
  await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
  // Toasts are shown one at a time: the Add toast ("Milestone added.") holds the place until it is dismissed, so Remove's toast would wait behind it; `addMilestone` dismisses it.
  await addMilestone(page, NAME);
  const toastWith = (words: string) => page.locator('[data-toast-text]', { hasText: words });
  await page.getByRole('button', { name: `Remove ${NAME}` }).click();
  const removed = toastWith('Removed');
  await expect(removed).toHaveText(`Removed ${FSI}${NAME}${PDI}.`);
  expect(await removed.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeVisible();

  // The same entry undone from the keys: the shell's "Undid <label>" reads the label as built.
  await page.getByRole('heading', { level: 2, name: 'Milestones' }).click();
  await page.keyboard.press('Control+z');
  const undid = toastWith('Undid');
  await expect(undid).toHaveText(`Undid Remove ${FSI}${NAME}${PDI}`);
  expect(await undid.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
});
