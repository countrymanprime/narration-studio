import { describe, expect, it } from 'vitest';
import type { TrackMapping } from '../../types';
import { chapterLink } from './chapterLink';

const mapping = (chapterId: string, trackGuid: string) => ({ chapterId, trackGuid }) as TrackMapping;

describe('a chapter link', () => {
  it('is unlinked with no mapping of the chapter', () => {
    expect(chapterLink([mapping('b', 't1')], 'a')).toEqual({ state: 'unlinked', mappings: [] });
  });

  it('is linked to the one track of its one mapping, whatever the other chapters hold', () => {
    const link = chapterLink([mapping('b', 't9'), mapping('a', 't1')], 'a');
    expect(link.state).toBe('linked');
    expect(link.trackGuid).toBe('t1');
  });

  it('is several with more than one mapping, and still names the first track for a screen that plays what the chapter has', () => {
    const link = chapterLink([mapping('a', 't1'), mapping('a', 't2')], 'a');
    expect(link.state).toBe('several');
    expect(link.trackGuid).toBe('t1');
    expect(link.mappings).toHaveLength(2);
  });
});
