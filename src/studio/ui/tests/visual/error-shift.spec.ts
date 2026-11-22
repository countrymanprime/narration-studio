// An error appears only as a toast, in a dialog, or in a slot that is on the page in every state at a fixed size (docs/design/design-system.md#errors,
// issue #4045). For each state in error-states.ts this draws the page with the host answering and again with the host failing, and requires every
// element outside the error's slot to keep its box to the pixel. guards/inlineErrors.test.ts finds the same defect in the source; this sees it drawn.
import { expect, test, type Page } from '@playwright/test';
import { ERROR_STATES, type ErrorState } from './error-states';
import { settleFrames, settlePage } from './helpers/settle';

const WIDTHS = [1440, 1100];

type Boxes = Record<string, string>;

/** Makes the state's methods answer as the mock does, or reject while `window.__ERROR_SHIFT_FAILING__` is set. */
async function installHost(page: Page, state: ErrorState, failFromStart: boolean): Promise<void> {
  await page.addInitScript(
    ({ failing, failFromStart }) => {
      const w = window as unknown as Record<string, unknown> & { __NARRATION_MOCK_BASE__?: Record<string, (...args: unknown[]) => unknown> };
      w.__ERROR_SHIFT_FAILING__ = failFromStart;
      w.__NARRATION_MOCK_OVERRIDES__ = Object.fromEntries(
        Object.entries(failing).map(([name, message]) => [
          name,
          (...args: unknown[]) => {
            if (w.__ERROR_SHIFT_FAILING__) return Promise.reject(new Error(message));
            const base = w.__NARRATION_MOCK_BASE__;
            if (!base) throw new Error('the mock api did not publish __NARRATION_MOCK_BASE__');
            return base[name]!.apply(base, args);
          },
        ]),
      );
    },
    { failing: state.failing, failFromStart },
  );
}

/**
 * The box of every element drawn on the page, keyed by its path from the body. Not measured: an element with role status or alert and what is in
 * it (the message itself), the state's slot, the toasts, and anything in a fixed layer (a toast, a tooltip, an overlay). An element left out does
 * not count in its siblings' positions in the path, so an error that appears does not rename the elements after it.
 */
function measure(slot: string | undefined): Boxes {
  const selector = ['[role="status"]', '[role="alert"]', '[data-toast-region]', ...(slot ? [slot] : [])].join(',');
  {
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
    return boxes;
  }
}

/** What moved between the two drawings: elements whose box changed, or that are drawn in only one of them. */
function moved(ok: Boxes, failing: Boxes): string[] {
  const keys = new Set([...Object.keys(ok), ...Object.keys(failing)]);
  return [...keys].filter((key) => ok[key] !== failing[key]).map((key) => `${key}: ${ok[key] ?? 'absent'} -> ${failing[key] ?? 'absent'}`);
}

async function draw(page: Page, state: ErrorState, failing: boolean): Promise<Boxes> {
  await page.clock.install();
  await installHost(page, state, failing && state.failFrom === 'start');
  await page.goto('/');
  await settlePage(page);
  await state.open(page);
  if (failing && state.failFrom === 'after-open') await page.evaluate(() => ((window as unknown as Record<string, unknown>).__ERROR_SHIFT_FAILING__ = true));
  await state.provoke?.(page);
  await state.ready(page, failing);
  await settleFrames(page);
  return page.evaluate(measure, state.slot);
}

for (const state of ERROR_STATES) {
  for (const width of WIDTHS) {
    test(`${state.name} / ${width}`, async ({ browser }) => {
      test.setTimeout(60_000);
      const shapes: Boxes[] = [];
      for (const failing of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        shapes.push(await draw(await context.newPage(), state, failing));
        await context.close();
      }
      const [ok, failing] = shapes as [Boxes, Boxes];
      expect(Object.keys(ok).length, 'the ok drawing measured nothing').toBeGreaterThan(50);
      const shift = moved(ok, failing);
      if (state.expectShift) {
        // Known debt: the spec proves it sees the shift. The pull request that fixes it makes this fail, and deletes `expectShift`.
        expect(shift.length, `${state.name} no longer shifts: delete its expectShift (${state.expectShift}) in error-states.ts`).toBeGreaterThan(0);
      } else {
        expect(shift.slice(0, 20), `${shift.length} elements moved when the error appeared`).toEqual([]);
      }
    });
  }
}
