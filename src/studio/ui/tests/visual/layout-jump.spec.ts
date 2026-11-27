// #4060: no layout jump. Arriving at a page, and the DAW dropping and answering again, must not move what the page already shows: whatever
// appears (the "REAPER linked" card on Settings, the "Connecting to REAPER…" chip) has its space reserved. The page's landmarks (headings,
// sections, groups, tables, regions) are read on every animation frame and keyed by what they are called; one that is on two frames in a row and
// has moved fails the test, with the time, the landmark and how far it moved. (The browser's own layout-shift entries are not the bar: they also
// count a right-aligned box that grows, whose content stays where it was.)
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

/** How long after arriving the page is watched. */
const ARRIVAL_MS = 600;
/** A landmark that moved more than this many pixels between two frames shifted. */
const TOLERANCE_PX = 0.5;

interface Move {
  frame: number;
  at: number;
  landmark: string;
  dx: number;
  dy: number;
}
interface Watched {
  frames: number;
  moves: Move[];
}

declare global {
  interface Window {
    __layoutWatch?: { stop: () => Watched };
  }
}

/** Starts recording the layout signature on every animation frame. Call `stopWatch` to read it. */
async function startWatch(page: Page): Promise<void> {
  await page.evaluate((tolerance) => {
    const selector = 'h1, h2, h3, section, nav, header, footer, table, [role="group"], [role="region"], [role="table"], [role="tablist"]';
    const key = (el: Element): string => {
      const label = el.getAttribute('aria-label') ?? (el.matches('h1, h2, h3') ? (el.textContent ?? '') : '');
      return `${el.tagName.toLowerCase()}|${label.trim().slice(0, 40)}`;
    };
    // A fixed or sticky layer moves with the viewport, not with the page, and a toast or tooltip is not the page.
    const inFixedLayer = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') return true;
      }
      return false;
    };
    const read = (): Map<string, { x: number; y: number }> => {
      const seen = new Map<string, { x: number; y: number; n: number }>();
      for (const el of document.querySelectorAll(selector)) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || inFixedLayer(el)) continue;
        // A landmark with no name cannot be told from its neighbours when one appears, so only named ones are followed.
        if (key(el).endsWith('|')) continue;
        // The nth landmark of the same name keeps its own entry, so two sections called alike are told apart by order.
        const base = key(el);
        const count = [...seen.keys()].filter((name) => name === base || name.startsWith(`${base}#`)).length;
        seen.set(count === 0 ? base : `${base}#${count}`, { x: box.x, y: box.y, n: 0 });
      }
      return seen;
    };
    const moves: Move[] = [];
    const start = performance.now();
    const page = () => document.querySelector('h1')?.textContent ?? '';
    let previous = read();
    let was = page();
    let frames = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      frames += 1;
      const next = read();
      // Another page has replaced the one before: its landmarks are not the old page's, so the comparison starts again from it.
      const now = page();
      if (now !== was) previous = new Map();
      was = now;
      for (const [landmark, box] of next) {
        const before = previous.get(landmark);
        if (!before) continue;
        const dx = box.x - before.x;
        const dy = box.y - before.y;
        if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance) moves.push({ frame: frames, at: Math.round(performance.now() - start), landmark, dx, dy });
      }
      previous = next;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__layoutWatch = {
      stop: () => {
        running = false;
        return { frames, moves };
      },
    };
  }, TOLERANCE_PX);
}

const stopWatch = (page: Page): Promise<Watched> => page.evaluate(() => window.__layoutWatch!.stop());

function expectStill(watched: Watched): void {
  expect(watched.frames, 'frames recorded').toBeGreaterThan(5);
  const shown = watched.moves.slice(0, 8).map((move) => `${move.at} ms: ${move.landmark} moved ${move.dx} px across, ${move.dy} px down`);
  expect(shown, `landmarks that moved:\n${shown.join('\n')}`).toEqual([]);
}

/** Opens a page of the app without a press (history push, as Back and Forward do), */
async function arrive(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * Pages that still move on arrival, with what moves (measured 2026-11-27): an expected failure, so the change that fixes it has to take the entry out.
 * Story Bible: the entry's voice samples, reference clips and dialogue cues each read the host after the entry is drawn, and the Relationships table
 * below them moves down 207 px when they arrive (#4060, F6's second half). Each of the three is a self-fetching section that draws an empty or no
 * state first; the fix reserves their room or holds what is below them, and needs the three sections' loaded sizes, which depend on the entry.
 */
const KNOWN: Partial<Record<string, string>> = {
  'Story Bible': 'Relationships moves 207 px when the voice samples, reference clips and dialogue cues arrive',
};

for (const { name, path } of [
  { name: 'Settings', path: '/settings' },
  { name: 'Story Bible', path: '/story-bible' },
] as const) {
  test(`arriving at ${name} moves nothing the page already shows`, async ({ page }) => {
    test.fail(KNOWN[name] !== undefined, `#4060, known: ${KNOWN[name]}`);
    await page.goto('/');
    await settlePage(page);
    await page.waitForTimeout(500);
    await startWatch(page);
    await arrive(page, path);
    await page.waitForTimeout(ARRIVAL_MS);
    expectStill(await stopWatch(page));
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  });
}

for (const name of ['Production', 'Proof', 'Editing'] as const) {
  test(`a DAW that drops and answers again moves nothing on ${name}`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, name);
    await page.waitForTimeout(800);
    const connecting = page.getByRole('button', { name: /^Connecting to REAPER…/ });
    await expect(connecting).toHaveCount(0);
    await startWatch(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
    await expect(connecting.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
    await expect(connecting).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(300);
    expectStill(await stopWatch(page));
  });
}
