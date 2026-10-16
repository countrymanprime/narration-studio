import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_DRIVERS } from '../app.drivers';
import { type Driver, goToPage } from '../drivers/shared';
import { REFLOW_VIEWPORT, VIEWPORTS, type Viewport } from '../viewports';
import { closeOverlays, defaultRoot, overlayProblemsWhileOpen, pointerPlan, scrollContent, type OverlayKind, type Point } from './overlayGuard';
import { settlePage } from './settle';

// The registry half of the overlay guard (definition of done, rule 1, "Overlays"). A page lists the overlays it has as
// `OverlayCase`s; `overlayGuardFor('Script', cases)` registers one Playwright test per case and viewport, and each test opens the
// overlay in every way the rule names (a pointer-opened one at every window edge and corner and beside the sidebar and the top bar;
// every one over scrolled content and, where the case names an overlay to sit over, while that other overlay is open) and fails
// when the overlay is covered at any of its points or leaves the window (overlayGuard.ts measures that).
//
// A new page adopts the guard in one line in tests/visual/overlays.spec.ts: `overlayGuardFor('Pickups')` runs the shell's overlays
// (the content context menu, the top bar's hints and menus, the navigation) on that page, and `overlayGuardFor('Pickups', pickupsCases)`
// adds the page's own, written in tests/visual/overlays/<page>.ts with the factories below.

export type OverlayPage = 'Production' | 'Schedule' | 'Script' | 'Story Bible' | 'Editing' | 'Proof' | 'Pickups' | 'Master & QC' | 'Delivery' | 'Settings';

/** The widths and heights an overlay is checked at: the suite's own matrix, and two windows far smaller than the product ships in. */
export const OVERLAY_VIEWPORTS: Viewport[] = [
  ...VIEWPORTS,
  { name: 'narrow-360x500', width: 360, height: 500 },
  { name: 'tiny-320x300', width: 320, height: 300 },
];

export interface OverlayCase {
  /** Unique within the page; part of the test title. */
  name: string;
  kind: OverlayKind;
  /** Opens the overlay. `at` is where the pointer goes, for a case with `pointer`. */
  open: (page: Page, at?: Point) => Promise<void>;
  /** The element that is the overlay. Default: the last visible one of its `kind` (overlayGuard.ts `defaultRoot`). */
  root?: (page: Page) => Locator;
  /**
   * `page` (default): the page is already open when `open` runs. `fresh`: only the app is loaded, at its first screen, and `open`
   * reaches the overlay itself (an existing state driver does, see `fromState`); it then runs once, with no scrolling.
   */
  start?: 'page' | 'fresh';
  /** The overlay follows the pointer: `open` runs once per point of `pointerPlan` (window edges and corners, beside the sidebar and the top bar). */
  pointer?: boolean;
  /** Another overlay that is already open when this one opens ("while another overlay is open"). It stays open if the product lets it. */
  over?: { name: string; open: (page: Page) => Promise<void> };
  /** Closes it, for an overlay Escape on the open menus and dialogs does not reach (a panel of the page, such as the Script drawers). */
  close?: (page: Page) => Promise<void>;
  /** Narrows the viewports it runs at, for an overlay that cannot exist at some sizes (the navigation drawer exists only below 768 px). */
  viewports?: (viewport: Viewport) => boolean;
  /** Skip the pass over scrolled content, for an overlay whose page has nothing to scroll. */
  scrolled?: false;
}

/**
 * Thrown by a case's `open` when the product deliberately did not open the overlay (a right click in a text field or on something
 * with no menu leaves the browser's own menu). The point is skipped, counted, and a case that never opened anywhere fails.
 */
export class NotOpened extends Error {}

/** The context menu: a right click at the pointer's position. */
export function contextMenuCase(name: string, options: Partial<Pick<OverlayCase, 'over' | 'viewports'>> = {}): OverlayCase {
  return {
    name,
    kind: 'context-menu',
    pointer: true,
    ...options,
    open: async (page, at) => {
      if (!at) throw new Error('a context menu case needs the pointer plan');
      // The shell stops the event at `document` once it has taken it, so the verdict is read from a capture listener a tick later.
      await page.evaluate(() => {
        const seen = window as unknown as { __contextMenuHandled?: boolean | null };
        seen.__contextMenuHandled = null;
        window.addEventListener('contextmenu', (event) => setTimeout(() => (seen.__contextMenuHandled = event.defaultPrevented), 0), {
          capture: true,
          once: true,
        });
      });
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForFunction(() => (window as unknown as { __contextMenuHandled?: boolean | null }).__contextMenuHandled !== null);
      const handled = await page.evaluate(() => (window as unknown as { __contextMenuHandled?: boolean | null }).__contextMenuHandled);
      if (!handled) throw new NotOpened(`the page left the right click at ${at.label} to the browser`);
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  };
}

/** An overlay opened by an existing state driver of the visual suite (tests/visual/drivers/<page>.ts), so the guard reuses how the catalog reaches it. */
export function fromState(
  statePage: string,
  state: string,
  kind: OverlayKind = 'dialog',
  options: Partial<Pick<OverlayCase, 'root' | 'viewports'>> = {},
): OverlayCase {
  const driver: Driver | undefined = APP_DRIVERS[statePage]?.[state];
  if (!driver) throw new Error(`no driver for ${statePage} / ${state}`);
  return { name: `${statePage}/${state}`, kind, start: 'fresh', scrolled: false, open: driver, ...options };
}

/** An overlay opened by a click on a control found by role and name, the common shape of a menu, popover, dialog or slide-over. */
export function clickCase(
  name: string,
  kind: OverlayKind,
  control: (page: Page) => Locator,
  options: Partial<Pick<OverlayCase, 'root' | 'over' | 'viewports' | 'scrolled'>> = {},
): OverlayCase {
  return {
    name,
    kind,
    ...options,
    open: async (page) => {
      await control(page).click();
    },
  };
}

/** A hint: the pointer rests on the control until the popup shows (a hint waits one second, ADR 0049). */
export function hoverCase(name: string, control: (page: Page) => Locator, options: Partial<Pick<OverlayCase, 'viewports' | 'over'>> = {}): OverlayCase {
  return {
    name,
    kind: 'tooltip',
    ...options,
    open: async (page) => {
      await control(page).hover();
      await page.locator('[role="tooltip"]:visible').last().waitFor({ timeout: 4000 });
    },
  };
}

const message = (error: unknown): string => (error instanceof Error ? error.message.split('\n')[0] : String(error));

async function startFresh(page: Page, viewport: Viewport, pageName: OverlayPage, start: 'page' | 'fresh'): Promise<void> {
  // A control a case cannot find fails that scenario in seconds with its name, instead of holding the test until its timeout.
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await settlePage(page);
  if (start === 'page') await goToPage(page, pageName);
}

function runCase(pageName: OverlayPage, overlay: OverlayCase, viewport: Viewport): void {
  test(`${pageName} / ${overlay.name} / ${viewport.name}`, async ({ page }) => {
    test.setTimeout(150_000);
    const start = overlay.start ?? 'page';
    const rootOf = overlay.root ?? ((p: Page) => defaultRoot(p, overlay.kind));
    const problems: string[] = [];
    let opened = 0;
    const leftToBrowser: string[] = [];
    // The catalog's drivers reach their states at the sizes the suite captures (down to the 390 px reflow width). Below that, a
    // state-driven overlay is reached at 390 px and the window is then narrowed with the overlay open, which is also what a person
    // who shrinks the window does.
    const narrowedAfterOpen = start === 'fresh' && viewport.width < REFLOW_VIEWPORT.width;
    const loadAt = narrowedAfterOpen ? REFLOW_VIEWPORT : viewport;
    await startFresh(page, loadAt, pageName, start);

    const scenario = async (title: string, at?: Point) => {
      const label = `${overlay.name} ${title}`;
      try {
        if (overlay.over) await overlay.over.open(page);
      } catch (error) {
        problems.push(`${label}: could not open the overlay it sits over (${overlay.over?.name}): ${message(error)}`);
        return;
      }
      try {
        const { close } = overlay;
        const closing = close ? () => close(page) : undefined;
        const open = async () => {
          await overlay.open(page, at);
          if (narrowedAfterOpen) await page.setViewportSize({ width: viewport.width, height: viewport.height });
        };
        problems.push(...(await overlayProblemsWhileOpen(page, open, { root: rootOf(page), label, close: closing })));
        opened += 1;
      } catch (error) {
        if (error instanceof NotOpened) leftToBrowser.push(`${label}: ${error.message}`);
        else problems.push(`${label}: did not open: ${message(error)}`);
      }
      // Whatever a scenario left open must not carry into the next: close it, or load the page again.
      if (!(await closeOverlays(page))) await startFresh(page, loadAt, pageName, start);
    };

    const pass = async (suffix: string) => {
      if (overlay.pointer) {
        for (const point of await pointerPlan(page)) await scenario(`at ${point.label}${suffix}`, point);
      } else {
        await scenario(`opened${suffix}`);
      }
    };

    await pass('');
    if (start === 'page' && overlay.scrolled !== false) {
      await scrollContent(page, 0.5);
      await pass(', over content scrolled halfway');
      await scrollContent(page, 1);
      await pass(', over content scrolled to the end');
    }
    if (leftToBrowser.length > 0) test.info().annotations.push({ type: 'left to the browser', description: leftToBrowser.join('\n') });
    // A case that never opened its overlay judged nothing: that is a broken case, not a clean page.
    if (opened === 0) problems.push(`${overlay.name}: the overlay never opened at any point (${leftToBrowser.length} left to the browser)`);
    expect(problems, `${pageName} / ${overlay.name} at ${viewport.name}:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
}

/** Registers the overlay guard for one page: one test per overlay and viewport. Call it at the top level of a spec file. */
export function overlayGuardFor(pageName: OverlayPage, ...caseLists: OverlayCase[][]): void {
  const seen = new Set<string>();
  for (const overlay of caseLists.flat()) {
    if (seen.has(overlay.name)) throw new Error(`${pageName}: two overlay cases are named "${overlay.name}"`);
    seen.add(overlay.name);
    for (const viewport of OVERLAY_VIEWPORTS) {
      if (overlay.viewports && !overlay.viewports(viewport)) continue;
      runCase(pageName, overlay, viewport);
    }
  }
}
