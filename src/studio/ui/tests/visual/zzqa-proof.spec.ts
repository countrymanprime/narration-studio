import { test, type Page } from '@playwright/test';
import { installModel, qaState, setQa } from './zzqa-model';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';
const S = '/tmp/claude-0/-home-user-narration-studio/7127db7c-26e6-566a-bff0-f4d24cd617e3/scratchpad/shots';
const insp = (p: Page) => p.getByRole('complementary', { name: 'Note' });
const hear = (p: Page) => insp(p).getByRole('button', { name: /^Hear it|^Stop hearing it/ });
const rows = (p: Page) => p.getByRole('region', { name: 'Notes' }).locator('tr[data-row]');
async function open(page: Page, qa: Record<string, unknown>, extra?: () => void) {
  await installModel(page);
  if (extra) await page.addInitScript(extra);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await rows(page).first().waitFor();
  await insp(page).waitFor();
  await setQa(page, qa);
}
async function report(page: Page, name: string) {
  const s = await qaState(page);
  const toasts = await page
    .locator('[data-toast-region]')
    .innerText()
    .catch(() => '');
  const label = await hear(page)
    .getAttribute('aria-label')
    .catch(() => '?');
  const status = await insp(page)
    .locator('[role=status],[role=alert]')
    .allInnerTexts()
    .catch(() => []);
  console.log(
    `\n== ${name}\nDAW loop=${s.state.loop}\nbutton=${label}\nrow=${JSON.stringify(status)}\ntoasts=${JSON.stringify(toasts)}\nlog=${s.log.join(' | ')}`,
  );
  await page.screenshot({ path: `${S}/${name}-${test.info().repeatEachIndex}.png` });
}
const pick = async (page: Page, n: number) => {
  await rows(page).nth(n).click();
  await hear(page).waitFor();
};

for (const serial of [false, true]) {
  test(`P1 leave inside 3s serial=${serial}`, async ({ page }) => {
    await open(page, { serial, loopDelays: [1500] });
    await hear(page).click();
    await page.waitForTimeout(300);
    await pick(page, 1);
    await page.waitForTimeout(4000);
    await report(page, `P1-s${serial}`);
  });
  test(`P2 leave, answer after 3s serial=${serial}`, async ({ page }) => {
    await open(page, { serial, loopDelays: [4500] });
    await hear(page).click();
    await page.waitForTimeout(300);
    await pick(page, 1);
    await page.waitForTimeout(6000);
    await report(page, `P2-s${serial}`);
  });
  for (const [kind, answer] of [
    ['loops', undefined],
    ['refused', { outcome: 'refused', reason: 'not_running', message: 'REAPER is not running.' }],
  ] as const) {
    for (const aDelay of [2000, 4500]) {
      test(`P3 A asked ${aDelay}, press B ${kind} serial=${serial}`, async ({ page }) => {
        await open(page, { serial, loopDelays: [aDelay, 0], loopAnswers: [undefined, answer] });
        await hear(page).click();
        await page.waitForTimeout(300);
        await pick(page, 1);
        await hear(page).click();
        await page.waitForTimeout(aDelay + 1500);
        await report(page, `P3-${aDelay}-${kind}-s${serial}`);
      });
    }
  }
  test(`P4 A asked 2000 (left), B pending 2500 serial=${serial}`, async ({ page }) => {
    await open(page, { serial, loopDelays: [2000, 2500] });
    await hear(page).click();
    await page.waitForTimeout(300);
    await pick(page, 1);
    await hear(page).click();
    await page.waitForTimeout(6500);
    await report(page, `P4-s${serial}`);
  });
  test(`P5 same note: late answer, app plays, Stop, press again pending serial=${serial}`, async ({ page }) => {
    await open(page, { serial, loopDelays: [4500, 2000] });
    await hear(page).click();
    await insp(page)
      .getByRole('button', { name: /^Stop hearing it/ })
      .waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    await hear(page).click(); // stop the app
    await page.waitForTimeout(200);
    await hear(page).click(); // press 2
    await page.waitForTimeout(6000);
    await report(page, `P5-s${serial}`);
  });
  test(`P6 leave Proof mid-ask and come back, press again serial=${serial}`, async ({ page }) => {
    await open(page, { serial, loopDelays: [2000, 2500] });
    await hear(page).click();
    await page.waitForTimeout(300);
    await goToPage(page, 'Pickups');
    await goToPage(page, 'Proof');
    await hear(page).waitFor();
    await hear(page).click();
    await page.waitForTimeout(6500);
    await report(page, `P6-s${serial}`);
  });
}
