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
  it.each([1, 18, 36, 1800, 3564, 3599, 3600, 3601, 4000, 7200])('for %s s recorded of a 3600 s estimate', (seconds) => {
    const c = chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds: seconds });
    const cell = buildPipelineRows([c])[0]!.cells.record.text;
    render(<NextUp inputs={inputsFor(c)} onGo={vi.fn()} timer={{ running: false, onStart: vi.fn() }} />);
    const sub = screen.getByText(/% recorded · /);
    const visible = sub.cloneNode(true) as Element;
    visible.querySelectorAll('.sr-only').forEach((el) => el.remove());
    expect(visible.textContent).toContain(`${cell} recorded`);
  });
});
