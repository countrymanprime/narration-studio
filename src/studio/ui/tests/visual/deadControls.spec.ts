import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEAD_CONTROL_DEBT, DEAD_CONTROL_TIMER_DRIVEN } from './guards/dead-controls-allowlist';
import { CONTROL_SELECTOR, enumerateControls, OVERLAY_SELECTOR, snapshotBody, type FoundControl } from './guards/deadControls';

// No button may do nothing or look like it does nothing (#3276, the owner's rule). For every page this opens the app on the mock backend,
// presses each control on a fresh load and requires one of: the page changed (text, state, an overlay, a toast, the address, focus moved
// somewhere else, a file chooser, a download, a new window), or the control already shows it is the current choice (a pressed toggle, the
// checked radio, the current tab or page), or it is disabled and says why (a tooltip, title or description a keyboard reaches). Controls
// that open a menu, popover or dialog are pressed again inside it, one level down. `UI_DEAD_CONTROLS=report:<file>` writes every finding to
// <file> instead of failing, which is how the audit list in #3276 was made.
const PAGES: Record<string, string> = {
  Shell: '/',
  Production: '/',
  Schedule: '/schedule',
  Script: '/script',
  'Story Bible': '/story-bible',
  Booth: '/booth',
  Editing: '/editing',
  Proof: '/proof',
  Pickups: '/pickups',
  'Master & QC': '/master',
  Delivery: '/delivery',
  Settings: '/settings',
};
const SHELL_ONLY = 'aside, header, nav, [data-shell]';
const report = process.env.UI_DEAD_CONTROLS?.startsWith('report:') ? process.env.UI_DEAD_CONTROLS.slice('report:'.length) : '';

type Finding = {
  page: string;
  path: string[];
  control: string;
  kind: 'dead-press' | 'disabled-without-reason' | 'unclickable' | 'acts' | 'shows-current-choice' | 'leaves-the-app' | 'disabled-with-reason';
  detail: string;
};

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('load');
  await page
    .getByRole('heading', { level: 1 })
    .first()
    .waitFor({ state: 'attached' })
    .catch(() => undefined);
  await page.waitForTimeout(150);
}

async function list(page: Page, scope: string | null, skip: string | null): Promise<FoundControl[]> {
  return page.evaluate(enumerateControls, { scope, selector: CONTROL_SELECTOR, skip, overlay: OVERLAY_SELECTOR });
}

async function reach(page: Page, path: string, steps: string[]): Promise<boolean> {
  await open(page, path);
  for (const [index, key] of steps.entries()) {
    const found = (await list(page, index === 0 ? null : OVERLAY_SELECTOR, null)).find((control) => control.key === key);
    if (!found) return false;
    await page
      .locator(`[data-dead-control="${found.index}"]`)
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await page.waitForTimeout(250);
  }
  return true;
}

// Whether a disabled control says why: a title or description, or a tooltip a keyboard reaches by focus (an aria-disabled button) or the pointer reaches
// on the wrapper a disabled button sits in.
async function saysWhy(page: Page, control: FoundControl): Promise<boolean> {
  if (control.described) return true;
  const target = page.locator(`[data-dead-control="${control.index}"]`);
  // A key press first, so the page is in keyboard modality and focus opens the tooltip the way tabbing to the control does.
  await page.keyboard.press('Shift');
  await target.focus({ timeout: 500 }).catch(() => undefined);
  await page.waitForTimeout(500);
  if (await page.evaluate(() => [...document.querySelectorAll('[role=tooltip]')].some((tip) => (tip.textContent ?? '').trim() !== ''))) return true;
  await target.hover({ force: true, timeout: 500 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  return page.evaluate(() => [...document.querySelectorAll('[role=tooltip]')].some((tip) => (tip.textContent ?? '').trim() !== ''));
}

// A page with many controls is split into parts that run on different workers: a control belongs to the part its name hashes to (its own name, or for
// one inside a menu or dialog the name of the control that opens it), so a listed control always lands in the same part.
const PARTS: Record<string, number> = { Production: 4, Shell: 2, Booth: 2, Script: 2, 'Story Bible': 2 };
const plainName = (key: string) => key.replace(/#\d+$/, '').replace('|', ' ');
const partOf = (key: string, parts: number) => [...plainName(key)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7) % parts;

async function audit(page: Page, name: string, path: string, steps: string[], findings: Finding[], part = 0): Promise<void> {
  if (!(await reach(page, path, steps))) return;
  const scope = steps.length ? OVERLAY_SELECTOR : null;
  const skip = !steps.length && name !== 'Shell' && name !== 'Production' ? SHELL_ONLY : null;
  const controls = (await list(page, scope, skip)).filter((control) => (name === 'Shell' && !steps.length ? control.inShell : true));
  const openers: string[] = [];
  // Rows of one list (Chapter 1, Chapter 2, ...) are one control: the first two of each pattern are pressed.
  const pressed = new Map<string, number>();
  const parts = PARTS[name] ?? 1;
  for (const control of controls) {
    const pattern = control.key.replace(/#\d+$/, '').replace(/\d+/g, 'N');
    const times = (pressed.get(pattern) ?? 0) + 1;
    pressed.set(pattern, times);
    if (times > 2) continue;
    if (partOf(steps[0] ?? control.key, parts) !== part) continue;
    const where = [name, ...steps];
    const id = `${where.join(' > ')} > ${control.key.replace(/#\d+$/, '').replace('|', ' ')}`;
    if (control.disabled) {
      // The page may have moved on since it was listed (an earlier press): ask a fresh one.
      if (!(await reach(page, path, steps))) break;
      const current = (await list(page, scope, skip)).find((found) => found.key === control.key);
      if (current) {
        const kind = (await saysWhy(page, current)) ? 'disabled-with-reason' : 'disabled-without-reason';
        findings.push({ page: name, path: steps, control: id, kind, detail: control.key });
      }
      continue;
    }
    if (control.current || control.external || control.anchor) {
      findings.push({ page: name, path: steps, control: id, kind: control.current ? 'shows-current-choice' : 'leaves-the-app', detail: '' });
      continue;
    }
    // A fresh page for every press: one press must never decide the next one's start.
    if (!(await reach(page, path, steps))) break;
    const fresh = (await list(page, scope, skip)).find((found) => found.key === control.key);
    if (!fresh) continue;
    const before = await page.evaluate(snapshotBody);
    const overlays = await page.evaluate((selector) => document.querySelectorAll(selector).length, OVERLAY_SELECTOR);
    const url = page.url();
    let chooser = false;
    let popup = false;
    let download = false;
    page.once('filechooser', () => (chooser = true));
    page.once('popup', () => (popup = true));
    page.once('download', () => (download = true));
    const target = page.locator(`[data-dead-control="${fresh.index}"]`);
    const failed = await target.click({ timeout: 3000 }).then(
      () => '',
      (error: Error) => error.message.split('\n')[0] ?? 'click failed',
    );
    if (failed) {
      findings.push({ page: name, path: steps, control: id, kind: 'unclickable', detail: failed.slice(0, 120) });
      continue;
    }
    // A result may take a moment (a mock answer, a React transition): watch for up to 600 ms and stop at the first change.
    let after = before;
    for (let waited = 0; waited < 600 && after === before; waited += 60) {
      await page.waitForTimeout(60);
      after = await page.evaluate(snapshotBody);
    }
    const overlaysAfter = await page.evaluate((selector) => document.querySelectorAll(selector).length, OVERLAY_SELECTOR);
    const moved = await page.evaluate((index) => {
      const active = document.activeElement;
      return active !== document.body && active?.getAttribute('data-dead-control') !== String(index);
    }, fresh.index);
    const acted = after !== before || page.url() !== url || chooser || popup || download || moved;
    findings.push({ page: name, path: steps, control: id, kind: acted ? 'acts' : 'dead-press', detail: acted ? '' : fresh.name });
    if (overlaysAfter > overlays && steps.length < 2) openers.push(control.key);
  }
  for (const key of openers) await audit(page, name, path, [...steps, key], findings, part);
}

for (const [name, path] of Object.entries(PAGES)) {
  for (let part = 0; part < (PARTS[name] ?? 1); part += 1) {
    test(`dead controls / ${name}${PARTS[name] ? ` / part ${part + 1} of ${PARTS[name]}` : ''}`, async ({ page }) => {
      test.setTimeout(900_000);
      await page.route(
        (url) => !/^https?:$/.test(url.protocol) || url.hostname !== 'localhost',
        (route) => (route.request().url().startsWith('data:') || route.request().url().startsWith('blob:') ? route.continue() : route.abort()),
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      const findings: Finding[] = [];
      await audit(page, name, path, [], findings, part);
      // A control the pointer cannot reach (clipped by a scroller, shown only on focus) is not one that does nothing; the report keeps it.
      const timerDriven = Object.keys(DEAD_CONTROL_TIMER_DRIVEN);
      const keys = findings
        .filter(
          (finding) => ['dead-press', 'disabled-without-reason'].includes(finding.kind) && !timerDriven.some((suffix) => finding.control.endsWith(suffix)),
        )
        .map((finding) => finding.control);
      if (report) {
        writeFileSync(`${report}.${name.replace(/\W+/g, '_')}.${part}.json`, JSON.stringify(findings, null, 1));
        return;
      }
      const listed = Object.keys(DEAD_CONTROL_DEBT).filter((key) => key.startsWith(`${name} > `));
      expect(
        keys.filter((key) => !(key in DEAD_CONTROL_DEBT)),
        'a control that does nothing visible: make it act, show a pending state and a result, say nothing changed, or disable it with a reason (#3276)',
      ).toEqual([]);
      expect(
        listed.filter((key) => partOf(key.split(' > ')[1] ?? '', PARTS[name] ?? 1) === part && !keys.includes(key)),
        'a control in DEAD_CONTROL_DEBT now acts or is gone: delete its line',
      ).toEqual([]);
    });
  }
}
