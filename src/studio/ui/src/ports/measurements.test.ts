import { describe, expect, it } from 'vitest';

import { createMockMeasurements } from './measurements';

describe('measurements port', () => {
  it('port-answers-value-or-reason: the mock refuses with a non-empty reason when nothing is measured', async () => {
    const mock = createMockMeasurements({ none: true });
    for (const answer of [await mock.roomTone('x'), await mock.takeLog(), await mock.pickupSessionSeconds(['a']), await mock.chapterLengths()]) {
      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.reason).not.toBe('');
    }
  });
});
