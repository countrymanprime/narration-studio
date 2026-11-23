import { test } from '@playwright/test';
import { installModel, qaState } from './zzqa-model';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
const S = '/tmp/claude-0/-home-user-narration-studio/7127db7c-26e6-566a-bff0-f4d24cd617e3/scratchpad/shots';
test('probe proof', async ({ page }) => {
  await installModel(page);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  const rows = page.getByRole('region', { name: 'Notes' }).locator('tr[data-row]');
  await rows.first().waitFor();
  console.log('rows', await rows.count());
  const insp = page.getByRole('complementary', { name: 'Note' });
  await insp.waitFor();
  console.log((await insp.innerText()).slice(0, 400));
  await insp.getByRole('button', { name: /^Hear it/ }).click();
  await page.waitForTimeout(500);
  console.log('after', await insp.getByRole('button', { name: /Hear it|Stop hearing/ }).getAttribute('aria-label'), JSON.stringify(await qaState(page)));
  await page.screenshot({ path: `${S}/probe-proof.png` });
});
test('probe pickups', async ({ page }) => {
  await installModel(page);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Pickups');
  const list = page.getByRole('region', { name: 'Pickups' });
  await list.getByRole('button', { name: 'Open in Booth at this line' }).first().waitFor();
  const btns = list.getByRole('button', { name: /original|Hear/i });
  console.log(
    'buttons',
    await btns.count(),
    await btns.evaluateAll((b) => b.map((x) => x.getAttribute('aria-label') + '|' + x.textContent + '|' + (x as HTMLButtonElement).disabled)),
  );
  await btns.first().click();
  await page.waitForTimeout(500);
  console.log(JSON.stringify(await qaState(page)));
  await page.screenshot({ path: `${S}/probe-pickups.png` });
});
