import { expect, type Locator, type Page } from '@playwright/test';

// The overlay guard for Master & QC (definition of done, rule 1, "Overlays"): an overlay is the topmost element at its own points and
// fully on screen. One file on purpose: the same technique is on PR #1756's branch (helpers/overlayGuard.ts), and this file folds into
// it when that merges. `overlayProblems` measures one open overlay; `pointerPlan` says where a pointer-opened overlay is opened.

export interface Point {
  label: string;
  x: number;
  y: number;
}

/** Waits until the root's box has stopped moving (a popup is placed after it mounts). */
async function settled(root: Locator): Promise<boolean> {
  try {
    await root.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return false;
  }
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = await root.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`;
    });
    if (now === previous) return true;
    previous = now;
    await root.page().waitForTimeout(40);
  }
  return true;
}

/** One sentence per problem (none when the overlay is fine): a point where something else is drawn on top, or a side that leaves the window. */
export async function overlayProblems(root: Locator, label: string): Promise<string[]> {
  if (!(await settled(root))) return [`${label}: never became visible`];
  const measured = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const inset = Math.min(8, rect.width / 4, rect.height / 4);
    const left = rect.left + inset;
    const right = rect.right - inset;
    const top = rect.top + inset;
    const bottom = rect.bottom - inset;
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    const points: Array<[string, number, number]> = [
      ['top-left', left, top],
      ['top-right', right, top],
      ['bottom-left', left, bottom],
      ['bottom-right', right, bottom],
      ['top-middle', midX, top],
      ['bottom-middle', midX, bottom],
      ['left-middle', left, midY],
      ['right-middle', right, midY],
      ['centre', midX, midY],
    ];
    const hits = points.map(([name, x, y]) => {
      const inWindow = x >= 0 && y >= 0 && x < viewport.width && y < viewport.height;
      const hit = inWindow ? document.elementFromPoint(x, y) : null;
      const covering =
        hit && !element.contains(hit) ? `${hit.tagName.toLowerCase()}${hit.getAttribute('role') ? `[role=${hit.getAttribute('role')}]` : ''}` : '';
      return { name, x: Math.round(x), y: Math.round(y), covering: inWindow ? covering : '' };
    });
    return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, viewport, hits };
  });
  const problems: string[] = [];
  const { rect, viewport } = measured;
  const out: string[] = [];
  if (rect.left < -0.5) out.push(`left edge at ${rect.left.toFixed(1)}`);
  if (rect.top < -0.5) out.push(`top edge at ${rect.top.toFixed(1)}`);
  if (rect.right > viewport.width + 0.5) out.push(`right edge at ${rect.right.toFixed(1)} of ${viewport.width}`);
  if (rect.bottom > viewport.height + 0.5) out.push(`bottom edge at ${rect.bottom.toFixed(1)} of ${viewport.height}`);
  if (out.length > 0) problems.push(`${label} is not fully on screen: ${out.join(', ')}`);
  for (const hit of measured.hits.filter((h) => h.covering))
    problems.push(`${label} is not topmost at its ${hit.name} (${hit.x},${hit.y}): ${hit.covering} is drawn there`);
  return problems;
}

/** The four window corners, the four edge midpoints, the centre, and the column beside the sidebar and the row under the top bar. */
export async function pointerPlan(page: Page): Promise<Point[]> {
  const layout = await page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find((a) => a.getBoundingClientRect().width > 0);
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      sidebarRight: aside?.getBoundingClientRect().right ?? 0,
    };
  });
  const { width, height, sidebarRight } = layout;
  const plan: Point[] = [
    { label: 'top-left corner', x: 1, y: 1 },
    { label: 'top-right corner', x: width - 2, y: 1 },
    { label: 'bottom-left corner', x: 1, y: height - 2 },
    { label: 'bottom-right corner', x: width - 2, y: height - 2 },
    { label: 'top edge', x: Math.round(width / 2), y: 1 },
    { label: 'bottom edge', x: Math.round(width / 2), y: height - 2 },
    { label: 'left edge', x: 1, y: Math.round(height / 2) },
    { label: 'right edge', x: width - 2, y: Math.round(height / 2) },
    { label: 'centre', x: Math.round(width / 2), y: Math.round(height / 2) },
  ];
  if (sidebarRight > 0) plan.push({ label: 'beside the sidebar', x: Math.round(sidebarRight) + 1, y: Math.round(height / 2) });
  return plan;
}

/** Closes whatever is open with Escape, then moves focus and the pointer away so one case never carries into the next. */
export async function closeOverlays(page: Page): Promise<void> {
  for (let press = 0; press < 3; press += 1) {
    if (!(await page.evaluate(() => document.querySelector('[role="menu"], [role="dialog"], [role="tooltip"]') !== null))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 1, size.height - 1);
}

export async function expectTopmost(root: Locator, label: string): Promise<void> {
  expect(await overlayProblems(root, label), `${label} must be topmost and fully on screen`).toEqual([]);
}
