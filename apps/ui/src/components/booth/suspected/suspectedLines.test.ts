import { describe, expect, it } from 'vitest';
import { suspectedCount, suspectedKey, suspectedLines, type SuspectedFlag } from './suspectedLines';

const flag = (over: Partial<SuspectedFlag> = {}): SuspectedFlag => ({
  chapterId: 'c8',
  paragraphId: 'p9',
  kind: 'skipped',
  wordStart: 2,
  wordEnd: 5,
  scriptStart: 40,
  scriptEnd: 43,
  script: 'down the hole',
  heard: '',
  ...over,
});

describe('suspected lines', () => {
  it('the-key-is-stable-and-a-dismissed-line-stays-dismissed: the same place has the same key and is listed once', () => {
    expect(suspectedKey(flag())).toBe(suspectedKey(flag({ heard: 'something else' })));
    expect(suspectedKey(flag())).not.toBe(suspectedKey(flag({ kind: 'restart' })));
    expect(suspectedLines([flag(), flag()], new Set(['p9']))).toHaveLength(1);
  });

  it('a-take-that-does-not-reach-a-flagged-place-adds-nothing: flags outside the take are not listed', () => {
    expect(suspectedLines([flag()], new Set(['p1']))).toEqual([]);
  });

  it('count-for-the-panel-header: dismissed ones are not counted', () => {
    const a = flag();
    const b = flag({ paragraphId: 'p10' });
    expect(suspectedCount([a, b], new Set())).toBe(2);
    expect(suspectedCount([a, b], new Set([suspectedKey(a)]))).toBe(1);
  });
});
