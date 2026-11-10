// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditingPageProvider } from './EditingPageState';
import { ScriptDoc } from './ScriptDoc';
import { docFromHeard } from './docFromHeard';
import { announceSel } from './announce';
import { selKeys, stepFlag, stepKey } from '../model';
import { initialPageState, pageReducer } from './scriptState';
import { syntheticChapter } from './scriptFixtures';

afterEach(cleanup);

// A step is judged by its median over several runs, so one garbage-collection pause or noisy-neighbour spike on a shared runner
// cannot fail it (it did, at 104 ms on main, #3238). A real slowdown of an order of magnitude moves every run and the median with it.
// The work done is asserted separately; the outlier cap only catches a step that hangs.
const BUDGET_MS = 100;
const OUTLIER_CAP_MS = 10 * BUDGET_MS;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const time = (f: () => void): number => {
  const t = performance.now();
  f();
  return performance.now() - t;
};

describe('ten-thousand-words', () => {
  const { paragraphs, answer } = syntheticChapter(10_000);
  let doc!: ReturnType<typeof docFromHeard>;
  it('builds the document', () => {
    const took = time(() => {
      doc = docFromHeard(paragraphs, answer);
    });
    expect(took).toBeLessThan(2000);
    expect(doc.items.length).toBeGreaterThanOrEqual(10_000 - doc.counts.miss);
    expect(doc.counts.mis + doc.counts.low + doc.counts.miss).toBeGreaterThan(0);
  });

  it('handles 20 cursor moves, 5 selections and a flag step, the median of each under 100 ms, with one element per word and content-visibility on every paragraph', () => {
    render(
      <EditingPageProvider doc={doc}>
        <ScriptDoc />
      </EditingPageProvider>,
    );
    expect(document.querySelectorAll('[data-k]')).toHaveLength(doc.items.length);
    const paras = [...document.querySelectorAll<HTMLElement>('[data-pid]')];
    expect(paras).toHaveLength(paragraphs.length);
    expect(paras.every((p) => p.style.contentVisibility === 'auto')).toBe(true);

    const keys = doc.items.map((i) => i.key);
    const moves: number[] = [];
    const steps: number[] = [];
    let at = 0;
    for (let i = 0; i < 20; i++) {
      at = (at * 31 + 977) % keys.length;
      const el = document.querySelector<HTMLElement>(`[data-k="${keys[at]}"]`)!;
      moves.push(time(() => fireEvent.mouseDown(el)));
      steps.push(
        time(() => {
          expect(stepKey(doc, keys[at], 1)).toBeTruthy();
        }),
      );
    }
    const selections: number[] = [];
    for (let i = 0; i < 5; i++) {
      const from = keys[(i * 1999) % keys.length];
      const to = keys[(i * 1999 + 1500) % keys.length];
      const sel = { anchor: from, head: to };
      selections.push(
        time(() => {
          const next = pageReducer(initialPageState, { type: 'select', anchor: from, head: to });
          expect(selKeys(doc, next.sel)).toHaveLength(1501);
          announceSel(doc, sel);
        }),
      );
    }
    const flags = Array.from({ length: 5 }, () => time(() => void stepFlag(doc, keys[0], 1)));
    for (const runs of [moves, steps, selections, flags]) {
      expect(median(runs)).toBeLessThan(BUDGET_MS);
      expect(Math.max(...runs)).toBeLessThan(OUTLIER_CAP_MS);
    }
  });
});
