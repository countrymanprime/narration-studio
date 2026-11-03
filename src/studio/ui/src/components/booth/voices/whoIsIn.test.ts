import { describe, expect, it } from 'vitest';
import type { Track } from '../../../api/contracts/tracks';
import type { Voice } from '../../engine/voices';
import { castOf, defaultTrackName, keyForNewTrack, withAddedVoices } from './whoIsIn';

const voice = (key: string, name: string, characters: string[] = [], narrator = key === '0'): Voice => ({
  guid: `{${name}}`,
  name,
  key,
  narrator,
  characters: characters.map((id) => ({ id, name: id, source: 'assigned' as const })),
});

const track = (guid: string, name: string, depth: number, isFolder = false): Track => ({
  guid,
  name,
  index: 0,
  color: '',
  muted: false,
  soloed: false,
  items: [],
  depth,
  isFolder,
});

describe('who is in it', () => {
  const voices = [voice('0', 'Narrator'), voice('1', 'Alice', ['alice']), voice('2', 'Gardeners', ['two', 'five'])];

  it('lists the chapter characters with lines first, each with its key or its lines, then the rest of the book', () => {
    const cast = castOf({
      inThisChapter: [
        { id: 'knave', name: 'Knave of Hearts' },
        { id: 'alice', name: 'Alice' },
        { id: 'cat', name: 'Cheshire Cat' },
        { id: 'king', name: 'King of Hearts' },
      ],
      characters: [
        { id: 'alice', name: 'Alice' },
        { id: 'duchess', name: 'Duchess' },
        { id: 'king', name: 'King of Hearts' },
        { id: 'turtle', name: 'Mock Turtle' },
      ],
      lines: new Map([
        ['king', 12],
        ['knave', 1],
        ['alice', 30],
      ]),
      voices,
    });
    expect(cast.inChapter.map((row) => [row.name, row.lines, row.key])).toEqual([
      ['Alice', 30, '1'],
      ['King of Hearts', 12, undefined],
      ['Knave of Hearts', 1, undefined],
      ['Cheshire Cat', 0, undefined],
    ]);
    expect(cast.elsewhere.map((row) => row.name)).toEqual(['Duchess', 'Mock Turtle']);
    // No track: the chapter's characters who speak and no voice records, most lines first.
    expect(cast.noTrack.map((row) => row.name)).toEqual(['King of Hearts', 'Knave of Hearts']);
  });

  it("a character the Narrator also voices has the Narrator's key", () => {
    const narrated = [{ ...voice('0', 'Narrator'), characters: [{ id: 'alice', name: 'Alice', source: 'assigned' as const }] }];
    const cast = castOf({ inThisChapter: [{ id: 'alice', name: 'Alice' }], characters: [], lines: new Map([['alice', 3]]), voices: narrated });
    expect(cast.inChapter[0].key).toBe('0');
    expect(cast.noTrack).toEqual([]);
  });

  it('the new track takes the next free key, none past nine, and 0 only as the first Narrator', () => {
    expect(keyForNewTrack(voices, 'Extras')).toBe('3');
    expect(keyForNewTrack([], 'Extras')).toBe('1');
    expect(keyForNewTrack([voice('1', 'Alice')], ' narrator ')).toBe('0');
    expect(keyForNewTrack(voices, 'Narrator')).toBe('3');
    const nine = Array.from({ length: 9 }, (_, at) => voice(String(at + 1), `V${at}`));
    expect(keyForNewTrack(nine, 'Extras')).toBe('');
  });

  it("the name is the one character's, or Extras for none or several", () => {
    expect(defaultTrackName([])).toBe('Extras');
    expect(defaultTrackName([{ id: 'king', name: 'King of Hearts' }])).toBe('King of Hearts');
    expect(defaultTrackName([{ id: 'king', name: '  ' }])).toBe('Extras');
    expect(
      defaultTrackName([
        { id: 'king', name: 'King of Hearts' },
        { id: 'knave', name: 'Knave' },
      ]),
    ).toBe('Extras');
  });

  it('the default name is numbered past the names the chapter has, whatever their case and spaces', () => {
    const named = [voice('2', ' extras '), voice('3', 'Extras 2'), voice('4', 'King of Hearts')];
    expect(defaultTrackName([], named)).toBe('Extras 3');
    expect(defaultTrackName([{ id: 'king', name: 'King of Hearts' }], named)).toBe('King of Hearts 2');
    expect(defaultTrackName([{ id: 'cook', name: 'Cook' }], named)).toBe('Cook');
  });

  it("an added voice the saved project lacks is the folder's last child; once saved it is listed once", () => {
    const tracks = [
      track('{F}', 'Chapter 1', 0, true),
      track('{N}', 'Narrator', 1),
      track('{S}', 'Sub', 1, true),
      track('{X}', 'x', 2),
      track('{G}', 'Chapter 2', 0, true),
    ];
    const merged = withAddedVoices(tracks, '{F}', [{ guid: '{K}', name: 'King' }]);
    expect(merged.map((each) => [each.guid, each.depth])).toEqual([
      ['{F}', 0],
      ['{N}', 1],
      ['{S}', 1],
      ['{X}', 2],
      ['{K}', 1],
      ['{G}', 0],
    ]);
    expect(withAddedVoices(merged, '{F}', [{ guid: '{k}', name: 'King' }])).toHaveLength(merged.length);
    expect(withAddedVoices(tracks, '{GONE}', [{ guid: '{K}', name: 'King' }])).toBe(tracks);
    expect(withAddedVoices(tracks, '{F}', [])).toBe(tracks);
  });
});
