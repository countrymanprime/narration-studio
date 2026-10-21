import { describe, expect, it } from 'vitest';
import type { DocCut } from '../model/cuts';
import { closedCutsFrom } from './chapterSource';

const cut = (over: Partial<DocCut>): DocCut => ({ id: 'c', a: 0, b: 0, mode: 'close', keys: ['p-1:3', 'p-1:4'], off0: 2, off1: 3.5, ...over });
const places = new Map([['p-1', { itemGuid: 'g', origin: 10 }]]);

describe('closed-cuts-for-the-clock-map', () => {
  it('places a closing cut in the source seconds of the item its paragraph was heard on', () => {
    expect(closedCutsFrom([cut({})], places)).toEqual([{ itemGuid: 'g', from: 12, to: 13.5 }]);
  });
  it.each([
    ['a cut that leaves a gap, which moves nothing', cut({ mode: 'gap' })],
    ['a cut of no words, which belongs to no paragraph', cut({ keys: [] })],
    ['a cut inside a take, whose offsets start at the take', cut({ takeId: 't-1' })],
    ['a cut of a paragraph the page has no item for', cut({ keys: ['p-9:1'] })],
    ['a cut of no length', cut({ off1: 2 })],
  ])('leaves out %s', (_, c) => {
    expect(closedCutsFrom([c], places)).toEqual([]);
  });
});
