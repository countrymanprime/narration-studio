import { describe, expect, it } from 'vitest';
import type { TrackItem } from '../../../api/contracts/tracks';
import { originalSpot } from './originalAudio';

const item = (over: Partial<TrackItem> = {}): TrackItem => ({
  guid: 'i1',
  position: 100,
  length: 60,
  name: 'ch1',
  sourceKind: 'WAVE',
  sourceFile: '/rec/ch1.wav',
  sourceAvailable: true,
  supported: true,
  takeGuid: 't1',
  sourceStart: 0,
  playRate: 1,
  ...over,
});

describe('originalSpot', () => {
  it('maps a project time into the item’s source file', () => {
    expect(originalSpot([item()], 130)).toEqual({ ok: true, sourceFile: '/rec/ch1.wav', at: 30 });
  });

  it('adds where the item starts in its file, and scales by the play rate', () => {
    expect(originalSpot([item({ sourceStart: 10, playRate: 2 })], 105)).toEqual({ ok: true, sourceFile: '/rec/ch1.wav', at: 20 });
  });

  it('treats a play rate of nothing as 1', () => {
    expect(originalSpot([item({ playRate: 0 })], 110)).toMatchObject({ ok: true, at: 10 });
  });

  it('picks the item that holds the time among several, an item’s end belonging to the next', () => {
    const items = [
      item({ guid: 'a', position: 0, length: 100, sourceFile: '/rec/a.wav' }),
      item({ guid: 'b', position: 100, length: 50, sourceFile: '/rec/b.wav' }),
    ];
    expect(originalSpot(items, 99.5)).toMatchObject({ sourceFile: '/rec/a.wav' });
    expect(originalSpot(items, 100)).toMatchObject({ sourceFile: '/rec/b.wav', at: 0 });
  });

  it('says there is no audio before the first item, in a gap, and at or past the end of the last', () => {
    for (const at of [99.9, 160, 1e6, -5]) expect(originalSpot([item()], at)).toMatchObject({ ok: false, reason: expect.stringMatching(/no audio/) });
    expect(originalSpot([], 10)).toMatchObject({ ok: false });
  });

  it('skips a file the app cannot read, and says so when that is all there is', () => {
    expect(originalSpot([item({ sourceAvailable: false }), item({ guid: 'x', sourceFile: '/rec/b.wav' })], 120)).toMatchObject({
      ok: true,
      sourceFile: '/rec/b.wav',
    });
    expect(originalSpot([item({ sourceAvailable: false })], 120)).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot read/) });
    expect(originalSpot([item({ supported: false })], 120)).toMatchObject({ ok: false });
  });
});
