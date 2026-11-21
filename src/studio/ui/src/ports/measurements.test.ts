import { describe, expect, it } from 'vitest';

import { createHostMeasurements, createMockMeasurements } from './measurements';

describe('measurements port', () => {
  it('port-answers-value-or-reason: the mock refuses with a non-empty reason when nothing is measured', async () => {
    const mock = createMockMeasurements({ none: true });
    for (const answer of [await mock.roomTone('x'), await mock.takeLog(), await mock.pickupSessionSeconds(['a']), await mock.chapterLengths()]) {
      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.reason).not.toBe('');
    }
  });

  // #3869: both ports read audio under a second as 0 s (no length), so the pace agrees with the board whichever port answers.
  it('both ports read audio under one second as 0 s and keep one second', async () => {
    const lengths = { a: 0.5, b: 0.99, c: 1, d: 685 };
    const expected = { ok: true, value: { a: 0, b: 0, c: 1, d: 685 } };
    expect(await createMockMeasurements({ lengths }).chapterLengths()).toEqual(expected);
    const host = createHostMeasurements({
      productionOverview: async () => ({ chapters: Object.entries(lengths).map(([id, recordedSeconds]) => ({ id, recordedSeconds })) }),
    } as never);
    expect(await host.chapterLengths()).toEqual(expected);
  });
});
