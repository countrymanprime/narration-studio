// Every route out of Proof's chapter view (and the chapter step) leaves focus on the chapter picker or a control that stays, never on <body> (#4014, found by the
// qa-breaker on #4000 and #4021).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

async function openChapterOne(page: Page): Promise<void> {
  await page.goto('/proof?mockChapterLink=confirmed');
  await settlePage(page);
  await page.getByText('Open notes, by chapter').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
  await page.getByRole('menuitemradio', { name: /^Chapter 1(: | — |$)/ }).click();
  await page.getByText('Recording check', { exact: true }).waitFor();
}
const onBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

const ROUTES: { name: string; leaves: boolean; focus: 'differences' | 'check'; go: (page: Page) => Promise<void> }[] = [
  { name: 'Escape', leaves: true, focus: 'differences', go: (page) => page.keyboard.press('Escape') },
  {
    name: 'the jump menu',
    leaves: true,
    focus: 'differences',
    go: async (page) => {
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox').or(page.getByRole('textbox')).first().fill('all chapters');
      await page
        .getByRole('option', { name: /All chapters/ })
        .first()
        .click();
    },
  },
  { name: 'browser Back', leaves: true, focus: 'differences', go: (page) => page.goBack() },
  { name: 'the next-chapter key', leaves: false, focus: 'check', go: (page) => page.keyboard.press('ArrowRight') },
];

for (const route of ROUTES) {
  test(`Proof: ${route.name} out of the chapter does not leave focus on <body>`, async ({ page }) => {
    await openChapterOne(page);
    if (route.focus === 'differences') {
      await page.getByRole('button', { name: 'Compare with the script' }).click();
      await page.getByRole('region', { name: 'Compare', exact: true }).getByRole('heading', { name: 'Compare the recording with the script' }).waitFor();
      await page.getByRole('button', { name: 'Differences' }).first().focus();
    } else {
      await page.getByRole('button', { name: 'Check recordings' }).first().focus();
    }
    await route.go(page);
    if (route.leaves) await expect(page.getByText('Open notes, by chapter')).toBeVisible();
    await expect.poll(() => onBody(page), { message: `focus fell to <body> after ${route.name}` }).toBe(false);
  });
}
