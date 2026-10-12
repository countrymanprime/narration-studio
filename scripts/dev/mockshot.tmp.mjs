import { capture, parseArgs } from './capture-studio-next-mock.mjs';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/narration-utils/apps/ui/package.json')('@playwright/test');
const [stepName, ...rest] = process.argv.slice(2);
const steps = {
  dump: async (p) => { const h = await p.locator('.page').first().innerHTML(); const i = h.indexOf('sx-legend'); console.log(h.slice(i+3000, i+7000)); },
  none: async () => {},
  select: async (p) => { const w = p.locator('[data-k]'); await w.nth(1).click(); await w.nth(4).click({ modifiers: ['Shift'] }); await p.waitForTimeout(300); },
  takes: async (p) => { await p.locator('[data-tchip]').first().click(); await p.waitForTimeout(400); await p.locator('[data-takes]').first().scrollIntoViewIfNeeded(); },
  delete: async (p) => { await steps.select(p); await p.keyboard.press('Delete'); await p.waitForTimeout(400); },
  fx: async (p) => { await steps.select(p); await p.keyboard.press('f'); await p.waitForTimeout(400); },
  drawer: async (p) => { await p.keyboard.press('Control+Shift+C'); await p.waitForTimeout(400); },
};
const launch = async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  return { close: () => b.close(), newContext: async (o) => { const ctx = await b.newContext(o); return { newPage: async () => { const p = await ctx.newPage(); const orig = p.screenshot.bind(p); p.screenshot = async (a) => { await steps[stepName](p); return orig(a); }; return p; } }; } };
};
const file = await capture(parseArgs(rest), { launch, log: () => {} });
console.log(file);
