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

const BUDGET_MS = 100;
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

  it('handles 20 cursor moves, 5 selections and a flag step, the logic of each under 100 ms, with one element per word and content-visibility on every paragraph', () => {
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
    const times: number[] = [];
    let at = 0;
    for (let i = 0; i < 20; i++) {
      at = (at * 31 + 977) % keys.length;
      const el = document.querySelector<HTMLElement>(`[data-k="${keys[at]}"]`)!;
      times.push(time(() => fireEvent.mouseDown(el)));
      times.push(time(() => void stepKey(doc, keys[at], 1)));
    }
    for (let i = 0; i < 5; i++) {
      const from = keys[(i * 1999) % keys.length];
      const to = keys[(i * 1999 + 1500) % keys.length];
      const sel = { anchor: from, head: to };
      times.push(
        time(() => {
          const next = pageReducer(initialPageState, { type: 'select', anchor: from, head: to });
          expect(selKeys(doc, next.sel)).toHaveLength(1501);
          announceSel(doc, sel);
        }),
      );
    }
    times.push(time(() => void stepFlag(doc, keys[0], 1)));
    expect(Math.max(...times)).toBeLessThan(BUDGET_MS);
  });
});
