import { describe, expect, it } from 'vitest';
import type { TrackItem } from '../../../api/contracts/tracks';
import { sourceSpot } from './usePlayOriginal';

const item = (over: Partial<TrackItem>): TrackItem => ({
  guid: 'g',
  position: 0,
  length: 100,
  name: 'n',
  sourceKind: 'WAVE',
  sourceFile: 'a.wav',
  sourceAvailable: true,
  supported: true,
  takeGuid: 't',
  sourceStart: 0,
  playRate: 1,
  ...over,
});

describe('sourceSpot', () => {
  const items = [
    item({ guid: 'a', position: 10, length: 20, sourceStart: 5 }),
    item({ guid: 'b', position: 40, length: 20, sourceFile: 'b.wav', sourceStart: 0, playRate: 2 }),
  ];

  it('maps a project second into the item under it, honouring the trim and the play rate', () => {
    expect(sourceSpot(items, { at: 15, time: null })).toEqual({ sourceFile: 'a.wav', seconds: 10 });
    expect(sourceSpot(items, { at: 45, time: null })).toEqual({ sourceFile: 'b.wav', seconds: 10 });
  });

  it('falls back to the app timeline when the line has no project second', () => {
    expect(sourceSpot(items, { at: null, time: 25 })).toEqual({ sourceFile: 'b.wav', seconds: 5 + 0 });
  });

  it('answers nothing for a line with no place, or no playable audio', () => {
    expect(sourceSpot(items, { at: null, time: null })).toBeUndefined();
    expect(sourceSpot([item({ sourceAvailable: false })], { at: 5, time: 5 })).toBeUndefined();
    expect(sourceSpot([], { at: 5, time: null })).toBeUndefined();
  });
});
