import { expect, type Locator, type Page } from '@playwright/test';

// The overlay guard (definition of done, rule 1, "Overlays"): an overlay is the topmost element at its own points and fully on
// screen. This file is the part with no opinion about the app: it measures one open overlay (`overlayProblems`,
// `assertOverlayIsTopmost`) and says where a pointer-opened overlay should be opened (`pointerPlan`). Which overlays a page has
// and how to open them live in tests/visual/overlays/, and `overlayGuardFor` (overlayGuardFor.ts) turns them into tests.

/** Which kind of overlay a case opens: it picks the root the guard looks for when a case names none. */
export type OverlayKind = 'context-menu' | 'menu' | 'popover' | 'tooltip' | 'dialog' | 'slide-over' | 'drawer' | 'rail';

export interface Point {
  label: string;
  x: number;
  y: number;
}

export interface OverlayCheckOptions {
  /** Names the overlay in a failure message. */
  label?: string;
  /** How far inside the box the sampled points sit, so a rounded corner or a border is not mistaken for a gap. Default 8 px. */
  insetPx?: number;
  /** Extra points to sample, in viewport coordinates, beyond the box's corners, edge midpoints and centre. */
  extraPoints?: Point[];
  /** Allows the box to leave the viewport on these sides (a sheet that scrolls inside itself is still bounded; a slide-over mid-slide is not allowed). */
  allowOffscreen?: ReadonlyArray<'left' | 'top' | 'right' | 'bottom'>;
}

interface Measurement {
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  viewport: { width: number; height: number };
  hits: Array<{ label: string; x: number; y: number; inside: boolean; occluder: string }>;
}

/** The default root for a kind of overlay; a case may name its own. */
export function defaultRoot(page: Page, kind: OverlayKind): Locator {
  switch (kind) {
    case 'context-menu':
    case 'menu':
      return page.locator('[role="menu"]:visible').last();
    case 'popover':
      return page.locator('[data-popover-popup]:visible').last();
    case 'tooltip':
      return page.locator('[role="tooltip"]:visible').last();
    case 'dialog':
      return page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last();
    case 'slide-over':
      return page.locator('[data-slide-over]:visible').last();
    case 'drawer':
      return page.getByRole('dialog', { name: 'Navigation' });
    case 'rail':
      return page.locator('aside:visible').first();
  }
}

/**
 * Where the pointer opens an overlay that follows it, on the page as it is laid out right now: the four window corners, the four
 * edge midpoints and the centre, then the places the shell makes awkward: the column just beside the sidebar, and the row just
 * under the top bar. A window edge the page chrome covers (the sidebar on the left, the top bar on the top) cannot be right-clicked
 * for a content menu, so it is moved to the nearest point of the content area and says so in its label.
 */
export async function pointerPlan(page: Page): Promise<Point[]> {
  const layout = await page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const visibleAside = [...document.querySelectorAll('aside')].find((aside) => aside.getBoundingClientRect().width > 0) ?? null;
    const main = document.querySelector('main');
    // The shell's content area is the scroll container that is the last child of <main> (ContextMenuHost's trigger).
    const host = main ? ([...main.children].filter((child) => child.tagName === 'DIV').pop() ?? null) : null;
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      sidebar: box(visibleAside),
      header: box(main?.querySelector(':scope > header') ?? null),
      host: box(host),
    };
  });
  const { width, height, sidebar, header, host } = layout;
  const area = host ?? { left: 0, top: 0, right: width, bottom: height };
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const points: Point[] = [];
  const add = (label: string, wantX: number, wantY: number) => {
    const x = clamp(Math.round(wantX), Math.ceil(area.left) + 1, Math.floor(area.right) - 2);
    const y = clamp(Math.round(wantY), Math.ceil(area.top) + 1, Math.floor(area.bottom) - 2);
    const moved = x !== Math.round(wantX) || y !== Math.round(wantY);
    if (points.some((point) => point.x === x && point.y === y)) return;
    points.push({ label: moved ? `${label} (nearest content point)` : label, x, y });
  };
  add('top-left corner', 0, 0);
  add('top-right corner', width - 1, 0);
  add('bottom-left corner', 0, height - 1);
  add('bottom-right corner', width - 1, height - 1);
  add('top edge', width / 2, 0);
  add('bottom edge', width / 2, height - 1);
  add('left edge', 0, height / 2);
  add('right edge', width - 1, height / 2);
  add('centre', width / 2, height / 2);
  if (sidebar) {
    add('beside the sidebar, middle', sidebar.right + 1, height / 2);
    add('beside the sidebar, top', sidebar.right + 1, (header?.bottom ?? 0) + 1);
    add('beside the sidebar, bottom', sidebar.right + 1, height - 2);
  }
  if (header) {
    add('under the top bar, middle', width / 2, header.bottom + 1);
    add('under the top bar, right', width - 2, header.bottom + 1);
  }
  return points;
}

/** Scrolls every scrollable region of the page to a fraction of its range (0 top, 1 bottom), so an overlay opens over scrolled content. */
export async function scrollContent(page: Page, fraction: number): Promise<void> {
  await page.evaluate((to) => {
    for (const element of document.querySelectorAll<HTMLElement>('main, main *')) {
      if (element.scrollHeight > element.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) {
        element.scrollTop = (element.scrollHeight - element.clientHeight) * to;
      }
    }
  }, fraction);
}

/** Waits until the root's box has stopped moving (a popup is placed after it mounts, a slide-over slides in). */
async function settledBox(root: Locator): Promise<void> {
  await root.waitFor({ state: 'visible', timeout: 5000 });
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = await root.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`;
    });
    if (now === previous) return;
    previous = now;
    await root.page().waitForTimeout(40);
  }
}

/**
 * Measures the overlay `root`: samples its corners, edge midpoints and centre (inset a few pixels) with `document.elementFromPoint`
 * and checks the element found there is the overlay or inside it, and that the whole box is inside the window. Returns one sentence
 * per problem (empty when the overlay is fine); a sentence names the element that covers the overlay and its stacking chain, which
 * is where the cause is.
 */
export async function overlayProblems(root: Locator, options: OverlayCheckOptions = {}): Promise<string[]> {
  const label = options.label ?? 'overlay';
  const inset = options.insetPx ?? 8;
  try {
    await settledBox(root);
  } catch {
    return [`${label}: never became visible`];
  }
  const extra = options.extraPoints ?? [];
  const measured: Measurement = await root.evaluate(
    (element, { inset: wanted, extra: more }) => {
      const rect = element.getBoundingClientRect();
      const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      // Names the element and the chain of its ancestors that make a stacking context (or a z-index), so a failure shows why.
      const describe = (hit: Element | null): string => {
        if (!hit) return 'nothing (outside the window)';
        const parts: string[] = [];
        for (let node: Element | null = hit, depth = 0; node && node !== document.documentElement && depth < 12; node = node.parentElement, depth += 1) {
          const style = getComputedStyle(node);
          const makesContext =
            (style.position !== 'static' && style.zIndex !== 'auto') ||
            style.position === 'fixed' ||
            style.position === 'sticky' ||
            style.isolation === 'isolate' ||
            Number(style.opacity) < 1 ||
            style.transform !== 'none' ||
            style.filter !== 'none' ||
            style.contain.includes('paint') ||
            style.contain.includes('layout');
          if (depth === 0 || makesContext) {
            const name = `${node.tagName.toLowerCase()}${node.getAttribute('role') ? `[role=${node.getAttribute('role')}]` : ''}`;
            parts.push(`${name}(${style.position}${style.zIndex === 'auto' ? '' : ` z=${style.zIndex}`}${makesContext && depth > 0 ? ' context' : ''})`);
          }
        }
        return parts.join(' < ');
      };
      const ix = Math.min(wanted, rect.width / 4);
      const iy = Math.min(wanted, rect.height / 4);
      const left = rect.left + ix;
      const right = rect.right - ix;
      const top = rect.top + iy;
      const bottom = rect.bottom - iy;
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      const sample: Array<[string, number, number]> = [
        ['top-left', left, top],
        ['top-right', right, top],
        ['bottom-left', left, bottom],
        ['bottom-right', right, bottom],
        ['top-middle', midX, top],
        ['bottom-middle', midX, bottom],
        ['left-middle', left, midY],
        ['right-middle', right, midY],
        ['centre', midX, midY],
        ...more.map((point: { label: string; x: number; y: number }): [string, number, number] => [point.label, point.x, point.y]),
      ];
      const hits = sample.map(([name, x, y]) => {
        // A point outside the window has no element: that is the on-screen check's finding, not an occlusion.
        const inWindow = x >= 0 && y >= 0 && x < viewport.width && y < viewport.height;
        const hit = inWindow ? document.elementFromPoint(x, y) : null;
        return { label: name, x: Math.round(x), y: Math.round(y), inside: !inWindow || (hit !== null && element.contains(hit)), occluder: describe(hit) };
      });
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport,
        hits,
      };
    },
    { inset, extra },
  );

  if (process.env.OVERLAY_GUARD_DEBUG)
    console.log(label, JSON.stringify(measured.rect), JSON.stringify(measured.viewport), measured.hits.map((h) => h.inside).join(''));
  const problems: string[] = [];
  const { rect, viewport } = measured;
  const allowed = new Set(options.allowOffscreen ?? []);
  const tolerance = 0.5;
  const offscreen: string[] = [];
  if (rect.left < -tolerance && !allowed.has('left')) offscreen.push(`left edge at ${rect.left.toFixed(1)}`);
  if (rect.top < -tolerance && !allowed.has('top')) offscreen.push(`top edge at ${rect.top.toFixed(1)}`);
  if (rect.right > viewport.width + tolerance && !allowed.has('right')) offscreen.push(`right edge at ${rect.right.toFixed(1)} of ${viewport.width}`);
  if (rect.bottom > viewport.height + tolerance && !allowed.has('bottom')) offscreen.push(`bottom edge at ${rect.bottom.toFixed(1)} of ${viewport.height}`);
  if (offscreen.length > 0) {
    problems.push(
      `${label} is not fully on screen: ${offscreen.join(', ')} (box ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}, window ${viewport.width}x${viewport.height})`,
    );
  }
  const covered = measured.hits.filter((hit) => !hit.inside);
  for (const hit of covered) {
    problems.push(`${label} is not topmost at its ${hit.label} (${hit.x},${hit.y}): ${hit.occluder} is drawn there`);
  }
  return problems;
}

/** Options for opening an overlay and checking it: where its root is, and what to call it. */
export interface OpenedOverlayOptions extends OverlayCheckOptions {
  root: Locator;
  /** Closes the overlay when Escape on the page's open menus and dialogs is not how (a drawer that is a panel of the page). */
  close?: () => Promise<void>;
}

/**
 * Opens an overlay with `open`, measures it (see `overlayProblems`), closes it with Escape and returns the problems. An `open`
 * that throws propagates after the overlay is closed, so a case can tell "did not open" from "opened but covered".
 */
export async function overlayProblemsWhileOpen(page: Page, open: () => Promise<void>, options: OpenedOverlayOptions): Promise<string[]> {
  try {
    await open();
    return await overlayProblems(options.root, options);
  } finally {
    await options.close?.();
    await closeOverlays(page);
  }
}

/**
 * The guard in one call: opens the overlay with `open`, fails the test when it is covered at any sampled point or leaves the
 * window, and closes it. `options.root` is the element that is the overlay.
 */
export async function assertOverlayIsTopmost(page: Page, open: () => Promise<void>, options: OpenedOverlayOptions): Promise<void> {
  expect(await overlayProblemsWhileOpen(page, open, options), `${options.label ?? 'overlay'} must be topmost and fully on screen`).toEqual([]);
}

/** Closes whatever is open with Escape (a popup first, then what it sat on), up to `presses` times, until no overlay is left. */
export async function closeOverlays(page: Page, presses = 3): Promise<boolean> {
  const anyOpen = () =>
    page.evaluate(
      () => document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"], [role="tooltip"], [data-popover-popup], [data-slide-over]') !== null,
    );
  for (let press = 0; press < presses && (await anyOpen()); press += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }
  // Focus leaves the control Escape was pressed on: keyboard focus on a navigation item opens the rail over the page (ADR 0761), which
  // would cover the next scenario's control. The pointer leaves too, so a hint or the hover rail of the last scenario does not carry over.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 1, size.height - 1);
  return !(await anyOpen());
}
