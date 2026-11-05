import { describe, expect, it } from 'vitest';
import type { Track, TrackItem } from './contracts/tracks';
import { chapterTrackOf } from './chapterTrackItems';

const item = (guid: string, position: number): TrackItem => ({
  guid,
  position,
  length: 5,
  name: guid,
  sourceKind: 'WAVE',
  sourceFile: `${guid}.wav`,
  sourceAvailable: true,
  supported: true,
  takeGuid: `take-${guid}`,
  sourceStart: 0,
  playRate: 1,
});
const track = (guid: string, depth: number, isFolder: boolean, items: TrackItem[] = []): Track => ({
  guid,
  index: 0,
  name: guid,
  color: '',
  muted: false,
  soloed: false,
  items,
  depth,
  isFolder,
});

describe('chapterTrackOf: the audio of the track a chapter is linked to', () => {
  it('flat: a plain track answers its own items', () => {
    const tracks = [track('A', 0, false, [item('a1', 0)]), track('B', 0, false, [item('b1', 9)])];
    expect(chapterTrackOf(tracks, 'B')?.items.map((i) => i.guid)).toEqual(['b1']);
  });

  it('voice folders: a folder answers the items of every voice inside it, and not the next chapter', () => {
    const tracks = [
      track('F', 0, true),
      track('Narrator', 1, false, [item('n1', 0)]),
      track('Hero', 1, false, [item('h1', 10), item('h2', 20)]),
      track('Next', 0, false, [item('x1', 99)]),
    ];
    const found = chapterTrackOf(tracks, 'F');
    expect(found?.track.guid).toBe('F');
    expect(found?.items.map((i) => i.guid)).toEqual(['n1', 'h1', 'h2']);
  });

  it('nested folders: a folder inside the chapter folder is read too', () => {
    const tracks = [
      track('F', 0, true),
      track('Narrator', 1, false, [item('n1', 0)]),
      track('Crowd', 1, true),
      track('Guard 1', 2, false, [item('g1', 5)]),
      track('Guard 2', 2, false, [item('g2', 6)]),
      track('Hero', 1, false, [item('h1', 10)]),
      track('Next', 0, true),
      track('Other', 1, false, [item('o1', 50)]),
    ];
    expect(chapterTrackOf(tracks, 'F')?.items.map((i) => i.guid)).toEqual(['n1', 'g1', 'g2', 'h1']);
    expect(chapterTrackOf(tracks, 'Crowd')?.items.map((i) => i.guid)).toEqual(['g1', 'g2']);
  });

  it('a chapter folder inside another folder reads only its own children', () => {
    const tracks = [
      track('Book', 0, true),
      track('Ch1', 1, true),
      track('V1', 2, false, [item('a', 0)]),
      track('Ch2', 1, true),
      track('V2', 2, false, [item('b', 7)]),
    ];
    expect(chapterTrackOf(tracks, 'Ch2')?.items.map((i) => i.guid)).toEqual(['b']);
    expect(chapterTrackOf(tracks, 'Book')?.items.map((i) => i.guid)).toEqual(['a', 'b']);
  });

  it('an empty folder (the last track, or voices with no items) is found with no items, not missing', () => {
    expect(chapterTrackOf([track('F', 0, true)], 'F')).toEqual({ track: expect.objectContaining({ guid: 'F' }), items: [] });
    const voices = [track('F', 0, true), track('V', 1, false), track('Next', 0, false, [item('x', 1)])];
    expect(chapterTrackOf(voices, 'F')?.items).toEqual([]);
  });

  it('repaired folders (children moved back inside after the chapter was created elsewhere) read as the folder they now are', () => {
    const repaired = [track('Next', 0, false, [item('x', 99)]), track('F', 0, true), track('V', 1, false, [item('v1', 3)])];
    expect(chapterTrackOf(repaired, 'F')?.items.map((i) => i.guid)).toEqual(['v1']);
  });

  it('a link that is not in the project, or no link, is undefined', () => {
    expect(chapterTrackOf([track('A', 0, false)], 'zzz')).toBeUndefined();
    expect(chapterTrackOf([track('A', 0, false)], undefined)).toBeUndefined();
    expect(chapterTrackOf([], 'A')).toBeUndefined();
  });

  it('does not reorder the voices: track order, then the order the track lists its items', () => {
    const tracks = [track('F', 0, true), track('V1', 1, false, [item('late', 90)]), track('V2', 1, false, [item('early', 1)])];
    expect(chapterTrackOf(tracks, 'F')?.items.map((i) => i.guid)).toEqual(['late', 'early']);
  });
});
