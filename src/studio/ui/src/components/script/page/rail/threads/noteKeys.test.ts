// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Mark } from '../../../../../api/contracts/marks';
import { useNoteKeys } from './noteKeys';

const mark = (id: string, type: string, text: string): Mark => ({
  id,
  chapterId: 'c1',
  paragraphId: 'p1',
  paragraph: 0,
  start: 0,
  end: 5,
  quote: 'Rabbit',
  type,
  text,
  thread: [],
  createdAt: `at-${text}`,
  stale: false,
});

describe('the key of each note card (#3458, qa-breaker round 3)', () => {
  it('when every note of a passage gets a new id in one list, each key follows the note that says the same', () => {
    const before = [mark('a', 'stress', 'N1'), mark('b', 'stress', 'N2'), mark('c', 'stress', 'N3')];
    const { result, rerender } = renderHook(({ marks }) => useNoteKeys(marks), { initialProps: { marks: before } });
    const keys = before.map((one) => result.current.keyOf(one));
    // All three replaced at once, and listed in another order.
    const after = [mark('z3', 'ask', 'N3'), mark('z1', 'ask', 'N1'), mark('z2', 'ask', 'N2')];
    rerender({ marks: after });
    expect(result.current.keyOf(after[1]!)).toBe(keys[0]);
    expect(result.current.keyOf(after[2]!)).toBe(keys[1]);
    expect(result.current.keyOf(after[0]!)).toBe(keys[2]);
  });
});
