// The overlay guard (definition of done, rule 1): an overlay must be the topmost element at its own points and fully on screen.
// Real-browser, no mocks of layout: it asks the page itself with document.elementFromPoint.
import type { Locator, Page } from '@playwright/test';

export type Probe = { ok: boolean; problems: string[]; box: { x: number; y: number; width: number; height: number } | null };

export type Status = 'PASS' | 'FAIL' | 'n/a';
export type Row = { overlay: string; place: string; viewport: string; status: Status; detail: string };

/**
 * Probes one overlay root. Points: the centre, the four corners and the four edge midpoints, each inset by up to 8 px so a rounded
 * corner is not mistaken for a gap. A point passes when elementFromPoint returns the root or one of its descendants. The box
 * must lie inside the viewport (innerWidth x innerHeight, 0.5 px tolerance).
 */
export async function probeOverlay(root: Locator): Promise<Probe> {
  return root.evaluate((el: Element) => {
    const describe = (hit: Element | null): string => {
      if (!hit) return 'null (no element: the point is outside the viewport)';
      const cls = typeof hit.className === 'string' ? hit.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const label = hit.getAttribute('aria-label') ?? (hit.textContent ?? '').trim().slice(0, 30);
      let layer = '';
      for (let node: Element | null = hit; node; node = node.parentElement) {
        const z = getComputedStyle(node).zIndex;
        if (z !== 'auto') {
          layer = ` z=${z}`;
          break;
        }
      }
      return `<${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}${cls ? '.' + cls : ''}${hit.getAttribute('role') ? ` role=${hit.getAttribute('role')}` : ''}> "${label}"${layer}`;
    };
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const problems: string[] = [];
    const tol = 0.5;
    if (rect.width < 1 || rect.height < 1) problems.push(`overlay has no size (${rect.width}x${rect.height})`);
    const sides: string[] = [];
    if (rect.left < -tol) sides.push(`left by ${(-rect.left).toFixed(1)}px`);
    if (rect.top < -tol) sides.push(`top by ${(-rect.top).toFixed(1)}px`);
    if (rect.right > vw + tol) sides.push(`right by ${(rect.right - vw).toFixed(1)}px`);
    if (rect.bottom > vh + tol) sides.push(`bottom by ${(rect.bottom - vh).toFixed(1)}px`);
    if (sides.length)
      problems.push(
        `not fully on screen: overflows the ${vw}x${vh} viewport at ${sides.join(', ')} (box ${rect.x.toFixed(0)},${rect.y.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`,
      );
    const inset = Math.max(1, Math.min(8, rect.width / 2 - 1, rect.height / 2 - 1));
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const points: [string, number, number][] = [
      ['centre', cx, cy],
      ['top-left', rect.left + inset, rect.top + inset],
      ['top-right', rect.right - inset, rect.top + inset],
      ['bottom-left', rect.left + inset, rect.bottom - inset],
      ['bottom-right', rect.right - inset, rect.bottom - inset],
      ['top-mid', cx, rect.top + inset],
      ['bottom-mid', cx, rect.bottom - inset],
      ['left-mid', rect.left + inset, cy],
      ['right-mid', rect.right - inset, cy],
    ];
    for (const [name, x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !el.contains(hit)) problems.push(`${name} (${x.toFixed(0)},${y.toFixed(0)}) is covered by ${describe(hit)}`);
    }
    return { ok: problems.length === 0, problems, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });
}

/** For a native control (a `<select>`): only on-screen can be asserted, its popup is drawn by the browser outside the DOM. */
export async function nativeSelectInfo(control: Locator): Promise<{ native: boolean; onScreen: boolean }> {
  return control.evaluate((el: Element) => {
    const r = el.getBoundingClientRect();
    return { native: el.tagName === 'SELECT', onScreen: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight };
  });
}

/** Where a trigger is forced to before it opens its overlay: a window edge or corner (the trigger is pinned there, position: fixed). */
export const EDGES = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'] as const;
export type Edge = (typeof EDGES)[number];

/** Pins `target` at an edge or corner of the window and returns a function that puts its inline style back. */
export async function pinToEdge(target: Locator, edge: Edge): Promise<() => Promise<void>> {
  const saved = await target.evaluate((el: HTMLElement, where: string) => {
    const before = el.getAttribute('style');
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = where.includes('left') ? 0 : where.includes('right') ? vw - w : (vw - w) / 2;
    const y = where.includes('top') ? 0 : where.includes('bottom') ? vh - h : (vh - h) / 2;
    el.style.position = 'fixed';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.margin = '0';
    el.style.zIndex = '1';
    return before;
  }, edge);
  return async () => {
    await target
      .evaluate((el: HTMLElement, before: string | null) => {
        if (before === null) el.removeAttribute('style');
        else el.setAttribute('style', before);
      }, saved)
      .catch(() => undefined);
  };
}

/** Scrolls every scrollable element (and the window) to its end, so an overlay opens over scrolled content. Returns how many moved. */
export async function scrollEverythingToEnd(page: Page): Promise<number> {
  return page.evaluate(() => {
    let moved = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        const before = el.scrollTop;
        el.scrollTop = el.scrollHeight;
        if (el.scrollTop !== before) moved++;
      }
    }
    const before = window.scrollY;
    window.scrollTo(0, document.documentElement.scrollHeight);
    if (window.scrollY !== before) moved++;
    return moved;
  });
}

/** Scrolls the trigger to the bottom edge of every scroller around it. Returns true when some ancestor actually scrolled. */
export async function scrollTriggerToBottom(trigger: Locator): Promise<boolean> {
  return trigger.evaluate((el: HTMLElement) => {
    const before: [Element, number][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) before.push([node, node.scrollTop]);
    el.scrollIntoView({ block: 'end' });
    return before.some(([node, top]) => node.scrollTop !== top);
  });
}

export function formatTable(rows: Row[]): string {
  const header = ['overlay', 'position', 'viewport', 'result', 'detail'];
  const lines = rows.map((r) => [r.overlay, r.place, r.viewport, r.status, r.detail.replace(/\|/g, '/')]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => Math.min(l[i].length, i === 4 ? 140 : 60))));
  const fmt = (cells: string[]) => cells.map((c, i) => (i === 4 ? c : c.padEnd(widths[i]))).join(' | ');
  return [fmt(header), ...lines.map(fmt)].join('\n');
}

export const RESULTS_FILE = 'screenshots/overlays/storybible.ndjson';
