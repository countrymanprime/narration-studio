import { describe, expect, it } from 'vitest';
import { CREDITS_STOP, chapterListStops } from './creditsRows';

describe('chapterListStops', () => {
  it('puts the opening credits before the first chapter and the closing credits after the last', () => {
    expect(chapterListStops(['c1', 'c2', 'c3'], { opening: true, closing: true })).toEqual([CREDITS_STOP.opening, 'c1', 'c2', 'c3', CREDITS_STOP.closing]);
  });

  it('leaves out a credits row that is not drawn', () => {
    expect(chapterListStops(['c1', 'c2'], { opening: false, closing: true })).toEqual(['c1', 'c2', CREDITS_STOP.closing]);
    expect(chapterListStops(['c1', 'c2'], { opening: true, closing: false })).toEqual([CREDITS_STOP.opening, 'c1', 'c2']);
    expect(chapterListStops(['c1'], {})).toEqual(['c1']);
  });
});
