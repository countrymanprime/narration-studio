import { test, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';
const OUT = process.env.SHOTS!;
const log = (o: unknown) => appendFileSync(`${OUT}/m.jsonl`, JSON.stringify(o) + '\n');
const scrollEnd = (page: Page) =>
  page.evaluate(() => {
    const popup = document.querySelector('[role="alertdialog"]')!;
    for (const el of popup.querySelectorAll<HTMLElement>('*'))
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
  });
const measure = (page: Page) =>
  page.evaluate(() => {
    const r = (el: Element) => {
      const a = el.getBoundingClientRect();
      return [a.left, a.top, a.right, a.bottom].map((n) => Math.round(n * 10) / 10);
    };
    const popup = document.querySelector('[role="alertdialog"]')!;
    const chip = popup.querySelector('[data-chain-pointer] button') as HTMLElement | null;
    const all = [...popup.querySelectorAll('button')];
    const row = all[all.length - 1]!.closest('.border-t')!;
    const body = row.previousElementSibling as HTMLElement;
    const cs = chip ? getComputedStyle(chip) : null;
    const tables = [...popup.querySelectorAll('table')];
    const lastRow = tables[tables.length - 1]?.querySelector('tbody tr:last-child');
    const cells = lastRow
      ? [...lastRow.querySelectorAll('td')].map((td) => {
          const range = document.createRange();
          range.selectNodeContents(td);
          return r(range as unknown as Element);
        })
      : [];
    return {
      popup: r(popup),
      body: r(body),
      row: r(row),
      chip: chip ? r(chip) : null,
      label: chip?.textContent,
      buttons: all.filter((b) => !body.contains(b)).map((b) => [b.textContent, ...r(b)]),
      lastRowText: cells,
      bodyScroll: [body.scrollTop, body.scrollHeight, body.clientHeight],
      bodyPad: getComputedStyle(body).paddingBottom,
      style: cs && { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, shadow: cs.boxShadow, font: cs.fontSize, opacity: cs.opacity },
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      focused: document.activeElement?.textContent?.slice(0, 40),
      focusTag: document.activeElement?.tagName,
    };
  });
const CASES: [number, number, string][] = [
  [275, 300, 'to-spec-approve-long-chain'],
  [275, 300, 'to-spec-approve-no-fx'],
  [320, 436, 'to-spec-approve-daw'],
  [320, 300, 'to-spec-approve-long-chain'],
  [1100, 800, 'to-spec-approve-long-chain'],
  [1440, 900, 'to-spec-approve-long-chain'],
];
for (const theme of ['light', 'dark'])
  for (const [w, h, driver] of CASES)
    test(`m ${theme} ${w}x${h} ${driver}`, async ({ page }) => {
      test.setTimeout(90000);
      await page.addInitScript(([k, v]) => window.localStorage.setItem(k!, v!), ['narration-ui-theme', theme]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await settlePage(page);
      await masterDrivers[driver]!(page);
      await page.setViewportSize({ width: w, height: h });
      const tag = `${theme}-${w}x${h}-${driver.replace('to-spec-approve-', '')}`;
      const before = await measure(page);
      await scrollEnd(page);
      await page.waitForTimeout(300);
      const chip = page.locator('[data-chain-pointer] button');
      if (!(await chip.count())) {
        log({ tag, chip: 'never shown', before });
        await page.screenshot({ path: `${OUT}/${tag}-nochip.png` });
        return;
      }
      const shown = await measure(page);
      log({ tag, state: 'shown', ...shown, beforeBody: before.body, beforeRow: before.row });
      await page.screenshot({ path: `${OUT}/${tag}-shown.png` });
      // hover tooltip
      await chip.hover();
      await page.waitForTimeout(900);
      const tip = await page.evaluate(() => {
        const t = document.querySelector('[role="tooltip"]');
        if (!t) return null;
        const a = t.getBoundingClientRect();
        return { text: t.textContent, box: [a.left, a.top, a.right, a.bottom].map(Math.round) };
      });
      log({ tag, state: 'hover', tip });
      await page.screenshot({ path: `${OUT}/${tag}-hover.png` });
      await page.mouse.move(1, 1);
      // keyboard: Tab from Cancel through the dialog, record order
      const order: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        order.push(
          await page.evaluate(() => {
            const a = document.activeElement as HTMLElement;
            return `${a.tagName}:${(a.getAttribute('aria-label') ?? a.textContent ?? '').slice(0, 28)}${a.closest('[data-chain-pointer]') ? ' [CHIP]' : ''}`;
          }),
        );
        if (order[order.length - 1]!.includes('[CHIP]')) break;
      }
      const onChip = order[order.length - 1]!.includes('[CHIP]');
      await page.waitForTimeout(900);
      const ring = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const c = getComputedStyle(a);
        const t = document.querySelector('[role="tooltip"]');
        return {
          outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor} off ${c.outlineOffset}`,
          tip: t?.textContent ?? null,
          describedby: a.getAttribute('aria-describedby'),
          title: a.getAttribute('title'),
          ariaLabel: a.getAttribute('aria-label'),
        };
      });
      log({ tag, state: 'tab', order, onChip, ring, after: await measure(page) });
      await page.screenshot({ path: `${OUT}/${tag}-focus.png` });
      if (onChip) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        const gone = await measure(page);
        log({
          tag,
          state: 'pressed',
          chip: gone.chip,
          body: gone.body,
          row: gone.row,
          buttons: gone.buttons,
          focused: gone.focused,
          focusTag: gone.focusTag,
          same: JSON.stringify([gone.body, gone.row, gone.buttons, gone.popup]) === JSON.stringify([shown.body, shown.row, shown.buttons, shown.popup]),
        });
        await page.screenshot({ path: `${OUT}/${tag}-pressed.png` });
      }
      // disabled look (what pending gives it)
      await scrollEnd(page);
      await page.waitForTimeout(300);
      if (await chip.count()) {
        await chip.evaluate((el) => ((el as HTMLButtonElement).disabled = true));
        log({ tag, state: 'disabled', opacity: await chip.evaluate((el) => getComputedStyle(el).opacity) });
        await page.screenshot({ path: `${OUT}/${tag}-disabled.png` });
      }
    });
