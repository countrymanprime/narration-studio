// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordedPercent } from '../../../recordedThrough';
import { WPH } from '../../schedule/estimates';
import { NextUp } from './NextUp';
import { chapter } from './pipelineFixtures';
import { buildPipelineRows } from './pipelineRows';

afterEach(cleanup);

const inputsFor = (recorded: ReturnType<typeof chapter>) => ({
  recording: {
    chapterId: recorded.id,
    stage: 'recording' as const,
    name: 'Chapter 1',
    words: recorded.wordCount,
    share: recorded.recordedSeconds === null ? null : Math.min(1, recorded.recordedSeconds / ((recorded.wordCount / WPH) * 3600)),
    percent: recordedPercent(recorded, WPH),
  },
  pickups: null,
  failing: null,
});

// #3443: Next up and the Record cell say the same percent for one chapter, at both ends: from the first second of audio, to a length that has reached or passed its estimate
// (the cell never says 100 for a measured length, only the host's "complete" does, so Next up must not either).
describe('Next up says the Record cell’s percent', () => {
  // [seconds recorded of a 3600 s estimate, the percent both say]: any measured audio is at least 1% (0.001 s too), none is 0%, and a measured length is never 100.
  it.each([
    [0, 0],
    [0.5, 1],
    [1, 1],
    [18, 1],
    [35.99, 1],
    [36, 1],
    [1800, 50],
    [3564, 99],
    [3599, 99],
    [3600, 99],
    [3601, 99],
    [4000, 99],
    [7200, 99],
  ])('for %s s recorded of a 3600 s estimate, both say %s%%', (seconds, percent) => {
    const c = chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds: seconds });
    const cell = buildPipelineRows([c])[0]!.cells.record.text;
    render(<NextUp inputs={inputsFor(c)} onGo={vi.fn()} timer={{ running: false, onStart: vi.fn() }} />);
    const sub = screen.getByText(/% recorded/);
    const visible = sub.cloneNode(true) as Element;
    visible.querySelectorAll('.sr-only').forEach((el) => el.remove());
    expect(visible.textContent).toContain(`${cell} recorded`);
    expect(cell).toBe(`${percent}%`);
    expect(visible.textContent).toContain(`${percent}% recorded`);
  });

  // A host that says 0% (the Go side can) is 0 on both, not 1: nothing is recorded.
  it('says 0% for a host 0, as the cell does', () => {
    const c = chapter('c1', {
      status: 'recording',
      wordCount: WPH,
      recordedSeconds: 0,
      recordedThrough: { paragraphId: 'p1', word: 0, percent: 0, complete: false, source: 'booth', confident: true },
    });
    expect(recordedPercent(c, WPH)).toBe(0);
  });

  // S2 (qa delta, a known cosmetic and not this PR's scope): with the host's "complete" the item still reads "Finish recording Chapter 1" above "100% recorded". Pinned as it is.
  it('reads 100% under "Finish recording" when the host says complete (known cosmetic, not changed here)', () => {
    const c = chapter('c1', {
      status: 'recording',
      wordCount: WPH,
      recordedSeconds: 3600,
      recordedThrough: { paragraphId: 'p1', word: 0, percent: 100, complete: true, source: 'booth', confident: true },
    });
    render(<NextUp inputs={inputsFor(c)} onGo={vi.fn()} timer={{ running: false, onStart: vi.fn() }} />);
    expect(screen.getByText('Finish recording Chapter 1')).toBeTruthy();
    expect(screen.getByText(/% recorded/).textContent).toBe('100% recorded');
  });

  // R1 (qa round 3): a chapter at or over its estimate has no time left to give: "99% recorded", not "99% recorded · about 0h 00m of finished audio left".
  it.each([3600, 4000])('leaves out the time left once %s s reaches the estimate', (seconds) => {
    const c = chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds: seconds });
    render(<NextUp inputs={inputsFor(c)} onGo={vi.fn()} timer={{ running: false, onStart: vi.fn() }} />);
    const sub = screen.getByText(/% recorded/);
    expect(sub.textContent).toBe('99% recorded');
    expect(sub.textContent).not.toMatch(/left/);
  });
});
