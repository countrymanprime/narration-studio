import { describe, expect, it } from 'vitest';
import type { Marks } from '../../../api/contracts/marks';
import { referenceOf } from './referenceOf';

const MARKS = { types: [], marks: [] } as unknown as Marks;

describe('the Reference a click names', () => {
  it('is nothing without a target, or when the entry and the mark are both gone', () => {
    expect(referenceOf(null, [], MARKS, [])).toBeNull();
    expect(referenceOf({ entryId: 'e1', noteId: 'n1' }, [], MARKS, [])).toBeNull();
    expect(referenceOf({}, [], MARKS, [])).toBeNull();
  });
});
