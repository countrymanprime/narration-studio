// Draws the three options for the render approval's chain pointer (#3605 item 4) over the real app: the mock-backend build,
// driven to Master's approval, with options (a) and (b) drawn in by editing the page (nothing here is app code).
//   pnpm --dir src/studio/ui run build:mock
//   pnpm --dir src/studio/ui exec vite preview --outDir node_modules/.cache/mock-build --port 4173 --strictPort &
//   CHROMIUM=<installed headless shell> node docs/research/mockups/approval-chain-pointer/shots.mjs
// Writes shots/<variant>-<width>x<height>-<theme>.png, shots/sheet-<width>x<height>-<theme>.png and shots/metrics.json.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../../src/studio/ui/package.json'));
const { chromium } = require('@playwright/test');
const [arrowW, arrowH, , , arrowPath] = require('@fortawesome/free-solid-svg-icons').faArrowUp.icon;

const origin = process.env.ORIGIN ?? 'http://localhost:4173';
const out = process.env.OUT ?? join(here, 'shots');
const crops = mkdtempSync(join(tmpdir(), 'pointer-crops-'));
mkdirSync(out, { recursive: true });

// The two-effect chain needs a short window before its first row can leave the view; in a large window only a long chain does.
const SIZES = [
  { width: 1440, height: 900, chain: 'long' },
  { width: 768, height: 1024, chain: 'long' },
  { width: 320, height: 436, chain: 'short' },
  { width: 320, height: 400, chain: 'short' },
];
const VARIANTS = [
  { id: 'none', title: 'Chain in view: no pointer (the same in every option)' },
  { id: 'c', title: '(c) Leave it: a third button in the action row (today)' },
  { id: 'a', title: '(a) A chip over the bottom edge of the body' },
  { id: 'b', title: '(b) An icon button beside Cancel' },
  { id: 'b-hint', title: '(b) with its tooltip (hover or keyboard focus)' },
];
const POINTER = /^See the \d+ effects? above/;

async function openApproval(browser, { width, height, chain }, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${origin}/?mockMastering=daw${chain === 'long' ? '&mockMasterChain=long' : ''}`);
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}[data-mock-hide]{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.getByRole('navigation').getByText('Master & QC').first().click();
  await page.getByRole('button', { name: 'About the mastering chain' }).waitFor();
  await page.getByRole('region', { name: 'Master to spec' }).getByRole('button', { name: 'Choose files to master…' }).click();
  await page.getByRole('table', { name: 'Files to export' }).waitFor();
  await page.getByLabel('Role for 00 Opening credits.wav').selectOption('credits_opening');
  await page.getByLabel('Role for 00 Closing credits.wav').selectOption('credits_closing');
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Retail sample.wav', exact: true }) }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Master & encode' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Approve this render?' });
  await dialog.getByRole('table', { name: 'FX chain this render runs' }).waitFor();
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  return { page, dialog };
}

// Puts the chain's first row out of view the way a narrator does: scrolls the long list, or scrolls a short window's body to the files.
const scrollPastChain = (dialog) =>
  dialog.evaluate((popup) => {
    const list = popup.querySelector('[role="group"][aria-label="FX chain this render runs"]');
    if (list && list.scrollHeight > list.clientHeight + 1) list.scrollTop = list.scrollHeight;
    const body = popup.querySelector('[data-dialog-actions]').previousElementSibling;
    const scroller = [body, ...body.querySelectorAll('*')].find((node) => node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== 'visible' && !list?.contains(node) && node !== list);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });

async function draw(dialog, variant) {
  if (variant === 'none') return;
  await scrollPastChain(dialog);
  const pointer = dialog.getByRole('button', { name: POINTER });
  await pointer.waitFor();
  if (variant === 'c') return;
  const label = (await pointer.textContent()).trim();
  await pointer.evaluate((button) => button.setAttribute('data-mock-hide', ''));
  // The action row is one line again, so the body is taller: scroll again to where the narrator was.
  await scrollPastChain(dialog);
  await dialog.evaluate(
    (popup, { variant, label, arrowW, arrowH, arrowPath }) => {
      const actions = popup.querySelector('[data-dialog-actions]');
      const arrow = `<svg viewBox="0 0 ${arrowW} ${arrowH}" aria-hidden="true" style="height:1em;width:${arrowW / arrowH}em"><path fill="currentColor" d="${arrowPath}"/></svg>`;
      if (variant === 'a') {
        // The `Pill` primitive's `filter` look, floating: its classes, plus the tooltip's shadow.
        const chip = document.createElement('button');
        chip.dataset.mock = 'chip';
        chip.className = 'inline-flex items-center justify-center whitespace-nowrap text-[0.88rem] font-medium h-[var(--chip-height)] rounded-full border px-3 leading-none border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)]';
        chip.innerHTML = `${arrow}<span style="margin-left:0.4rem">${label.replace(/^See the /, '').replace('switched off', 'off')}</span>`;
        const box = popup.getBoundingClientRect();
        Object.assign(chip.style, { position: 'fixed', left: `${box.left + box.width / 2}px`, transform: 'translateX(-50%)', bottom: `${innerHeight - actions.getBoundingClientRect().top + 8}px`, boxShadow: 'var(--shadow-lg)', zIndex: '9999' });
        document.body.append(chip);
        return;
      }
      // The `IconButton` primitive, cloned from the dialog's Close, with the arrow and the pointer's words as its name.
      const cancel = actions.querySelector('button');
      const icon = popup.querySelector('button[aria-label="Close"]').cloneNode(true);
      icon.dataset.mock = 'icon';
      icon.setAttribute('aria-label', label);
      icon.innerHTML = arrow;
      icon.style.marginRight = 'auto';
      cancel.style.marginRight = '0';
      cancel.after(icon);
      if (variant === 'b-hint') {
        const hint = document.createElement('div');
        hint.dataset.mock = 'hint';
        hint.className = 'w-max max-w-60 rounded-[0.4rem] bg-[var(--text)] px-[0.65rem] py-2 text-[0.78rem] leading-[1.35] text-[var(--bg)] shadow-[var(--shadow-lg)]';
        hint.textContent = label;
        const at = icon.getBoundingClientRect();
        Object.assign(hint.style, { position: 'fixed', left: `${Math.max(8, at.left + at.width / 2 - 80)}px`, bottom: `${innerHeight - at.top + 6}px`, zIndex: '9999' });
        document.body.append(hint);
      }
    },
    { variant, label, arrowW, arrowH, arrowPath },
  );
}

const measure = (dialog) =>
  dialog.evaluate((popup) => {
    const actions = popup.querySelector('[data-dialog-actions]');
    const row = popup.querySelector('[role="group"][aria-label="FX chain this render runs"] tbody tr').getBoundingClientRect();
    const hit = document.elementFromPoint(row.left + 8, row.top + Math.min(10, row.height / 2));
    const tops = new Set([...actions.querySelectorAll('button:not([data-mock-hide])')].map((button) => Math.round(button.getBoundingClientRect().top)));
    return {
      actionRow: Math.round(actions.getBoundingClientRect().height),
      body: Math.round(actions.previousElementSibling.getBoundingClientRect().height),
      buttonLines: tops.size,
      firstEffectInView: Boolean(hit && popup.contains(hit) && hit.closest('tbody')),
    };
  });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const metrics = {};
for (const size of SIZES) {
  const name = `${size.width}x${size.height}`;
  for (const theme of ['light', 'dark']) {
    const panels = [];
    for (const { id, title } of VARIANTS) {
      if (id === 'b-hint' && size.width !== 320) continue;
      const { page, dialog } = await openApproval(browser, size, theme);
      await draw(dialog, id);
      await page.waitForTimeout(200);
      if (id !== 'none') await scrollPastChain(dialog);
      await page.waitForTimeout(200);
      if (theme === 'light') metrics[`${id} ${name}`] = await measure(dialog);
      const small = size.width === 320;
      if (id !== 'b-hint' || small) await page.screenshot({ path: join(out, `${id}-${name}-${theme}.png`), scale: small ? 'device' : 'css' });
      // The sheet shows the whole window when it is small, and the dialog with a margin when it is large.
      const crop = join(crops, `${id}-${name}-${theme}.png`);
      const box = await dialog.boundingBox();
      const clip = small ? undefined : { x: box.x - 24, y: Math.max(0, box.y - 24), width: box.width + 48, height: Math.min(size.height, box.height + 48) };
      await page.screenshot({ path: crop, clip });
      panels.push({ title, src: `data:image/png;base64,${readFileSync(crop).toString('base64')}`, width: clip?.width ?? size.width });
      await page.context().close();
    }
    const perRow = size.width === 320 ? 3 : 2;
    const sheet = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: perRow * (panels[0].width + 24) + 24, height: 600 } });
    const ink = theme === 'dark' ? '#e8e2d6' : '#26221c';
    await sheet.setContent(
      `<body style="margin:0;padding:12px;background:${theme === 'dark' ? '#14110d' : '#e9e4da'};font:600 13px/1.3 system-ui,sans-serif;color:${ink}">
        <div style="padding:0 12px 10px;font-size:15px">Render approval, ${name}, ${theme}${size.chain === 'long' ? ', long chain' : ', two effects'}</div>
        <div style="display:flex;flex-wrap:wrap">${panels.map((panel) => `<figure style="margin:0 12px 16px;width:${panel.width}px"><figcaption style="min-height:2.6em;padding-bottom:6px">${panel.title}</figcaption><img src="${panel.src}" style="display:block;width:100%;outline:1px solid ${ink}55"></figure>`).join('')}</div></body>`,
    );
    await sheet.waitForLoadState('load');
    await sheet.screenshot({ path: join(out, `sheet-${name}-${theme}.png`), fullPage: true });
    await sheet.close();
  }
}
writeFileSync(join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
await browser.close();
console.log(metrics);
