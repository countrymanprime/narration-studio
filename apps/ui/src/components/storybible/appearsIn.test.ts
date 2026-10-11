import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { chaptersOf, type ChapterRef } from './appearsIn';

const manuscript: ChapterRef[] = [
  { id: 'c1', title: 'One' },
  { id: 'c2', title: 'Two', subtitle: 'Later' },
  { id: 'c3', title: 'Three' },
];
const at = (...ids: string[]) => ({ appearances: ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex })) });

describe('pure-selector-properties', () => {
  it('lists each chapter once, in reading order, whatever the order or scene count of the appearances', () => {
    expect(chaptersOf(at('c3', 'c1', 'c1', 'c3'), manuscript)?.map((c) => c.id)).toEqual(['c1', 'c3']);
  });
  it('ignores an appearance whose chapter is not in the manuscript', () => {
    expect(chaptersOf(at('gone', 'c2'), manuscript)?.map((c) => c.id)).toEqual(['c2']);
  });
  it('is undefined without appearances and empty with an empty list', () => {
    expect(chaptersOf({}, manuscript)).toBeUndefined();
    expect(chaptersOf({ appearances: [] }, manuscript)).toEqual([]);
  });
  it('never mutates its input and gives the same answer twice', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('c1', 'c2', 'c3', 'zz')), (ids) => {
        const entity = at(...ids);
        const before = JSON.stringify([entity, manuscript]);
        const first = chaptersOf(entity, manuscript);
        expect(JSON.stringify([entity, manuscript])).toBe(before);
        expect(chaptersOf(entity, manuscript)).toEqual(first);
      }),
    );
  });
});
