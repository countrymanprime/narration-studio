// An error appears only as a toast, in a dialog, or in a slot that is on the page in every state at a fixed size (docs/design/design-system.md#errors,
// issue #4045). For each state in error-states.ts this draws the page with the host answering and again with the host failing, and requires every
// element outside the error's slot to keep its box to the pixel. guards/inlineErrors.test.ts finds the same defect in the source; this sees it drawn.
// Each test first draws the page twice with the host answering and requires the two to match, so a difference it reports is the error's.
import { expect, test, type Page } from '@playwright/test';
import { ERROR_STATES, type ErrorState } from './error-states';
import { settleFrames, settlePage } from './helpers/settle';
import { MOCK_DAY } from './lib/pinnedDay';

const WIDTHS = [1440, 1100];

type Boxes = Record<string, string>;

/**
 * Makes the state's methods answer as the mock does, or reject while `window.__ERROR_SHIFT_FAILING__` is set, and counts in
 * `window.__ERROR_SHIFT_SETTLED__` the calls of them that have answered or rejected.
 */
async function installHost(page: Page, state: ErrorState, failFromStart: boolean): Promise<void> {
  await page.addInitScript(
    ({ failing, failFromStart }) => {
      const w = window as unknown as Record<string, unknown> & { __NARRATION_MOCK_BASE__?: Record<string, (...args: unknown[]) => unknown> };
      w.__ERROR_SHIFT_FAILING__ = failFromStart;
      w.__ERROR_SHIFT_SETTLED__ = 0;
      const settled = () => (w.__ERROR_SHIFT_SETTLED__ = Number(w.__ERROR_SHIFT_SETTLED__) + 1);
      w.__NARRATION_MOCK_OVERRIDES__ = Object.fromEntries(
        Object.entries(failing).map(([name, message]) => [
          name,
          (...args: unknown[]) => {
            const base = w.__NARRATION_MOCK_BASE__;
            if (!base) throw new Error('the mock api did not publish __NARRATION_MOCK_BASE__');
            const answer = w.__ERROR_SHIFT_FAILING__ ? Promise.reject(new Error(message)) : Promise.resolve(base[name]!.apply(base, args));
            void answer.then(settled, settled);
            return answer;
          },
        ]),
      );
    },
    { failing: state.failing, failFromStart },
  );
}

const settledCalls = (page: Page): Promise<number> => page.evaluate(() => Number((window as unknown as Record<string, unknown>).__ERROR_SHIFT_SETTLED__));

/**
 * The box of every element drawn on the page, keyed by its path from the body, and the box of the first `neighbour`. Not measured: an element with role status or alert and what is in
 * it (the message itself), the state's slot, the toasts, and anything in a fixed layer (a toast, a tooltip, an overlay). An element left out does
 * not count in its siblings' positions in the path, so an error that appears does not rename the elements after it.
 */
function measure({ slot, neighbour }: { slot?: string; neighbour?: string }): { boxes: Boxes; neighbour?: string } {
  const selector = ['[role="status"]', '[role="alert"]', '[data-toast-region]', ...(slot ? [slot] : [])].join(',');
  {
    // The motion styles stop CSS animations; one started from script (the Web Animations API) is run to its end.
    for (const animation of document.getAnimations()) animation.finish();
    // Boxes in the page's own coordinates: a scroll that a shorter page could not make is not a move.
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 || el.scrollLeft > 0) el.scrollTo(0, 0);
    const fixed = new WeakMap<Element, boolean>();
    const inFixedLayer = (el: Element | null): boolean => {
      if (!el || el === document.body) return false;
      const known = fixed.get(el);
      if (known !== undefined) return known;
      const answer = getComputedStyle(el).position === 'fixed' || inFixedLayer(el.parentElement);
      fixed.set(el, answer);
      return answer;
    };
    const boxes: Record<string, string> = {};
    const walk = (el: Element, path: string) => {
      const counts: Record<string, number> = {};
      for (const child of el.children) {
        if (child.matches(selector) || inFixedLayer(child)) continue;
        const tag = child.tagName.toLowerCase();
        counts[tag] = (counts[tag] ?? 0) + 1;
        const at = `${path}>${tag}[${counts[tag]}]`;
        const r = child.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) boxes[at] = `${r.x},${r.y},${r.width},${r.height}`;
        walk(child, at);
      }
    };
    walk(document.body, 'body');
    const near = neighbour ? document.querySelector(neighbour)?.getBoundingClientRect() : undefined;
    return { boxes, neighbour: near && `${near.x},${near.y},${near.width},${near.height}` };
  }
}

/** What moved between the two drawings: elements whose box changed, or that are drawn in only one of them. */
function moved(ok: Boxes, failing: Boxes): string[] {
  const keys = new Set([...Object.keys(ok), ...Object.keys(failing)]);
  return [...keys].filter((key) => ok[key] !== failing[key]).map((key) => `${key}: ${ok[key] ?? 'absent'} -> ${failing[key] ?? 'absent'}`);
}

/** The page's boxes, and where `neighbour` is when one is named. Every drawing starts at the same clock time, so a date or a "minutes ago" reads alike. */
async function draw(page: Page, state: ErrorState, failing: boolean): Promise<{ boxes: Boxes; neighbour?: string }> {
  await page.clock.install({ time: MOCK_DAY });
  await installHost(page, state, failing && state.failFrom === 'start');
  await page.goto('/');
  await settlePage(page);
  await state.open(page);
  if (failing && state.failFrom === 'after-open') await page.evaluate(() => ((window as unknown as Record<string, unknown>).__ERROR_SHIFT_FAILING__ = true));
  const before = await settledCalls(page);
  await state.provoke?.(page);
  // The call the state provokes has answered (or failed) before the page is read, in both drawings.
  if (state.failFrom === 'after-open') await expect.poll(() => settledCalls(page), { message: 'the provoked call never settled' }).toBeGreaterThan(before);
  await state.ready(page, failing);
  await settleFrames(page);
  return page.evaluate(measure, { slot: state.slot, neighbour: state.expectShift?.neighbour });
}

for (const state of ERROR_STATES) {
  for (const width of WIDTHS) {
    test(`${state.name} / ${width}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const drawings: Awaited<ReturnType<typeof draw>>[] = [];
      for (const failing of [false, false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        drawings.push(await draw(await context.newPage(), state, failing));
        await context.close();
      }
      const [ok, again, failing] = drawings as [(typeof drawings)[0], (typeof drawings)[0], (typeof drawings)[0]];
      expect(Object.keys(ok.boxes).length, 'the ok drawing measured nothing').toBeGreaterThan(50);
      const unsteady = moved(ok.boxes, again.boxes);
      expect(unsteady.slice(0, 20), `${unsteady.length} elements differ between two drawings with the host answering`).toEqual([]);
      const shift = moved(ok.boxes, failing.boxes);
      if (state.expectShift) {
        // Known debt: the spec proves it sees the shift where it is. The pull request that fixes it makes this fail, and deletes `expectShift`.
        const { pr, neighbour } = state.expectShift;
        expect([ok.neighbour, failing.neighbour], `${neighbour} is not on the page in both drawings`).not.toContain(undefined);
        expect(failing.neighbour, `${state.name} no longer moves ${neighbour}: delete its expectShift (${pr}) in error-states.ts`).not.toBe(ok.neighbour);
        expect(shift.length).toBeGreaterThan(0);
      } else {
        expect(shift.slice(0, 20), `${shift.length} elements moved when the error appeared`).toEqual([]);
      }
    });
  }
}
