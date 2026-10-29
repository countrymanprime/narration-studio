import { describe, expect, it } from 'vitest';
import { relocate, type LiveItem } from './liveItems';
import { asItem, FILE_NAME, playlistFor, recording, score, type Piece } from './followScenarios';

const LEN = recording().length;
const live = (p: Piece): LiveItem => ({
  guid: p.guid,
  sourceFile: FILE_NAME,
  position: p.position,
  length: p.length,
  sourceStart: p.sourceStart,
  playRate: p.rate,
});
const whole = (position: number, extra: Partial<Piece> = {}): Piece => ({ guid: 'A', position, sourceStart: 0, length: LEN, rate: 1, ...extra });
const split = (cut: number, gone: number, at = 10): Piece[] => [
  { guid: 'A', position: at, sourceStart: 0, length: cut, rate: 1 },
  { guid: 'B', position: at + cut, sourceStart: cut + gone, length: LEN - cut - gone, rate: 1 },
];

const scenarios: Array<[string, Piece[]]> = [
  ['single item', [whole(10)]],
  ['moved', [whole(15)]],
  ['trimmed at start', [whole(10, { sourceStart: 20, length: LEN - 20 })]],
  ['rate 1.25', [whole(10, { rate: 1.25, length: LEN / 1.25 })]],
  ['rate 0.8', [whole(10, { rate: 0.8, length: LEN / 0.8 })]],
  ['6 s deleted and closed', split(40, 6)],
  ['split, nothing moved', split(40, 0)],
  ['split mid-sentence with a gap of 3 s before the right half', [{ ...split(40.4, 0)[0] }, { ...split(40.4, 0)[1], position: 60 }]],
  ['chapter at project start', [whole(0)]],
];

describe('relocate: the follow lands on the spoken sentence whatever the DAW has done to the items', () => {
  it.each(scenarios)('%s', (_name, actual) => {
    const r = relocate(playlistFor('A'), actual.map(live));
    const s = score(r, actual);
    expect(s.wrongSentence).toBe(0);
    expect(s.maxMs).toBeLessThan(1);
    expect(s.unlit).toBeLessThan(s.samples * 0.01);
  });

  it('a section taken out belongs to no piece, and the words around it are still found', () => {
    const r = relocate(playlistFor('A'), split(40, 6).map(live));
    expect(r.playlist.every((s) => s.sourceEnd <= 40 || s.sourceStart >= 46)).toBe(true);
  });

  it('a source the DAW no longer has leaves nothing to follow', () => {
    expect(relocate(playlistFor('A'), [{ ...live(whole(10)), sourceFile: 'other.wav' }]).playlist).toEqual([]);
  });

  it('paths compare without regard to separators or case', () => {
    const l = { ...live(whole(10)), sourceFile: FILE_NAME.toUpperCase().replace('/', '\\') };
    expect(relocate(playlistFor('A'), [l]).playlist.length).toBeGreaterThan(0);
  });

  it('a path spelled otherwise by the DAW is found by its name, when nothing plays the saved spelling', () => {
    const l = { ...live(whole(10)), sourceFile: 'D:\\Other\\' + FILE_NAME };
    expect(relocate(playlistFor('A'), [l]).playlist.length).toBeGreaterThan(0);
  });

  it('an item with no audio file plays nothing', () => {
    expect(relocate(playlistFor('A'), [{ ...live(whole(10)), sourceFile: '' }]).playlist).toEqual([]);
  });

  it('closing cuts follow the piece that plays their seconds', () => {
    const r = relocate(playlistFor('A'), split(40, 0).map(live), [{ itemGuid: 'A', from: 38, to: 43 }]);
    expect(r.cuts).toEqual([
      { itemGuid: 'A', from: 38, to: 40 },
      { itemGuid: 'B', from: 40, to: 43 },
    ]);
  });

  it('the saved items are the page before the fix: they skip sentences once the DAW is edited', () => {
    const actual = [whole(15)];
    const s = score({ playlist: playlistFor('A'), items: [asItem(whole(10))] }, actual);
    expect(s.wrongSentence).toBeGreaterThan(0);
  });
});
