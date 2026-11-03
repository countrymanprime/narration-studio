// @vitest-environment jsdom
// The chart's labels sit clear of its lines and inside the card (follow-up to #1896; issue 1942).
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { addDays } from '../../schedule/dates';
import { labelRect } from './chartLabels';
import { ProgressChart } from './ProgressChart';
import { MID_BOOK, NO_TAKE_LOG, STORY_TODAY, overviewFor } from './overviewFixtures';

afterEach(cleanup);

const draw = (due: Date | null, recordedHours = 0.1) => {
  const o = overviewFor(MID_BOOK, due);
  return render(<ProgressChart k={o.k} wph={9300} start={o.start} today={STORY_TODAY} due={due} recordedHours={recordedHours} series={o.series} noteBelow />);
};

const rectOf = (t: Element) =>
  labelRect(
    { x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')), anchor: t.getAttribute('text-anchor') === 'end' ? 'end' : 'start' },
    t.textContent ?? '',
  );

const labelled = (c: HTMLElement, re: RegExp) => [...c.querySelectorAll('text')].find((t) => re.test(t.textContent ?? ''))!;

const DUES: Array<[string, Date]> = [
  ['today', STORY_TODAY],
  ['tomorrow', addDays(STORY_TODAY, 1)],
  ['in a week', addDays(STORY_TODAY, 7)],
  ['in two months', addDays(STORY_TODAY, 60)],
  ['at the end of the plan year 9999', new Date(9999, 11, 31)],
  ['long past', addDays(STORY_TODAY, -40)],
];

describe('ProgressChart labels clear the lines', () => {
  for (const [name, due] of DUES) {
    it(`never crosses the due line with "today" or "done" when the due date is ${name}`, () => {
      const { container } = draw(due);
      const dueX = Number(container.querySelector('[data-line="due"]')!.getAttribute('x1'));
      for (const re of [/^today$/, /^done /]) {
        const r = rectOf(labelled(container, re));
        const crossed = r.x1 <= dueX && dueX <= r.x2;
        // A due line on the dot itself can only be passed by the label starting beside it; it is never inside the text.
        expect(crossed, `${re} spans the due line at x=${dueX}: ${r.x1}..${r.x2}`).toBe(false);
      }
    });

    it(`keeps every label inside the card when the due date is ${name}`, () => {
      const { container } = draw(due);
      const width = Number(container.querySelector('svg')!.getAttribute('width'));
      for (const re of [/^today$/, /^done /, /^due /]) {
        const r = rectOf(labelled(container, re));
        expect(r.x1, String(re)).toBeGreaterThanOrEqual(0);
        expect(r.x2, String(re)).toBeLessThanOrEqual(width);
      }
    });
  }
});

describe('ProgressChart labels and the plan and estimate lines', () => {
  const segment = (el: Element) => ({
    x1: Number(el.getAttribute('x1')),
    y1: Number(el.getAttribute('y1')),
    x2: Number(el.getAttribute('x2')),
    y2: Number(el.getAttribute('y2')),
  });
  for (const [name, due] of DUES) {
    it(`leaves the plan and estimate lines clear of today and done when the due date is ${name}`, () => {
      const { container } = draw(due);
      const lines = ['plan', 'projection']
        .map((l) => container.querySelector(`[data-line="${l}"]`))
        .filter((e): e is Element => e !== null)
        .map(segment);
      for (const re of [/^today$/, /^done /]) {
        const r = rectOf(labelled(container, re));
        for (const l of lines) {
          // Sample the line: none of it may fall inside the label's box.
          for (let t = 0; t <= 1; t += 0.002) {
            const px = l.x1 + (l.x2 - l.x1) * t;
            const py = l.y1 + (l.y2 - l.y1) * t;
            expect(px >= r.x1 && px <= r.x2 && py >= r.y1 && py <= r.y2, `${re} at ${px},${py}`).toBe(false);
          }
        }
      }
    });
  }
});

describe('ProgressChart unmeasured-days note', () => {
  it('is a caption under the plot, outside the drawing, so no line can strike it', () => {
    const o = overviewFor(MID_BOOK, addDays(STORY_TODAY, 60), NO_TAKE_LOG);
    const { container } = render(
      <ProgressChart k={o.k} wph={9300} start={o.start} today={STORY_TODAY} due={addDays(STORY_TODAY, 60)} recordedHours={0} series={o.series} noteBelow />,
    );
    const note = container.querySelector('[data-chart-note]')!;
    expect(note.textContent).toBe('Recorded days not measured yet');
    expect(container.querySelector('svg')!.contains(note)).toBe(false);
  });
});

describe('ProgressChart today label', () => {
  it('never sits on the dot, even when both sides of it are crossed', () => {
    const { container } = draw(addDays(STORY_TODAY, 1));
    const dot = container.querySelector('[data-marker="today"]')!;
    const [cx, cy] = [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))];
    const r = rectOf(labelled(container, /^today$/));
    const onDot = r.x1 <= cx + 6 && r.x2 >= cx - 6 && r.y1 <= cy + 6 && r.y2 >= cy - 6;
    expect(onDot).toBe(false);
  });
});

describe('ProgressChart date axis', () => {
  it('keeps the last date label whole: it ends at the right edge instead of being cut off', () => {
    const { container } = draw(addDays(STORY_TODAY, 20));
    const width = Number(container.querySelector('svg')!.getAttribute('width'));
    const ticks = [...container.querySelectorAll('text')].filter(
      (t) => /^[A-Z][a-z]{2} \d{1,2}$/.test(t.textContent ?? '') && Number(t.getAttribute('y')) > 150,
    );
    expect(ticks.length).toBeGreaterThan(1);
    for (const t of ticks) {
      const x = Number(t.getAttribute('x'));
      const w = (t.textContent ?? '').length * 6.6;
      const left = t.getAttribute('text-anchor') === 'end' ? x - w : x - w / 2;
      const right = t.getAttribute('text-anchor') === 'end' ? x : x + w / 2;
      expect(left, t.textContent!).toBeGreaterThanOrEqual(0);
      expect(right, t.textContent!).toBeLessThanOrEqual(width);
    }
  });
});
