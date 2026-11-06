import { describe, expect, it } from 'vitest';
import type { Track } from '../../api/contracts/tracks';
import type { GuideEntity } from '../../api/contracts/storyBible';
import { folderChildren, folderVoices } from './voices';

const track = (guid: string, name: string, depth: number, isFolder = false): Track => ({
  guid,
  index: 0,
  name,
  color: '',
  muted: false,
  soloed: false,
  items: [],
  depth,
  isFolder,
});
const entity = (id: string, name: string, aliases: string[] = []): GuideEntity =>
  ({ id, canonical_name: name, aliases: aliases.map((text) => ({ text })), category: 'Character' }) as unknown as GuideEntity;

const tracks = [
  track('c7', 'Chapter 7', 0),
  track('c8', 'Chapter 8', 0, true),
  track('alice', 'Alice', 1),
  track('nar', 'Narrator', 1),
  track('queen', 'Queen', 1),
  track('crowd', 'Gardeners', 1, true),
  track('two', 'Two', 2),
  track('cat', 'Cheshire Cat', 1),
  track('c9', 'Chapter 9', 0),
];
const cast = [entity('e-alice', 'Alice'), entity('e-queen', 'Queen of Hearts', ['Queen']), entity('e-cat', 'Cheshire Cat'), entity('e-two', 'Two')];

describe('the voices of a chapter folder', () => {
  it('are its direct children in REAPER order, not grandchildren nor the tracks after it', () => {
    expect(folderChildren(tracks, 'c8').map((t) => t.name)).toEqual(['Alice', 'Narrator', 'Queen', 'Gardeners', 'Cheshire Cat']);
    expect(folderChildren(tracks, 'c7')).toEqual([]);
    expect(folderChildren(tracks, 'gone')).toEqual([]);
  });

  it("never reach a sibling chapter folder or a flat chapter after it: keys number only the folder's own children (#2251)", () => {
    const siblings = [
      track('c3', 'Chapter 3', 0, true),
      track('n3', 'Narrator', 1),
      track('v3', 'Veyra', 1),
      track('c4', 'Chapter 4', 0, true),
      track('n4', 'Narrator', 1),
      track('a4', 'Alice', 1),
      track('c5', 'Chapter 5', 0),
    ];
    const setup = { layout: 'folders' as const, narratorCharacter: '', tracks: [] };
    expect(folderVoices(siblings, 'c3', [], setup).map((voice) => [voice.key, voice.name])).toEqual([
      ['0', 'Narrator'],
      ['1', 'Veyra'],
    ]);
    expect(folderVoices(siblings, 'c4', [], setup).map((voice) => [voice.key, voice.guid])).toEqual([
      ['0', 'n4'],
      ['1', 'a4'],
    ]);
    expect(folderChildren(siblings, 'c5')).toEqual([]);
  });

  it('give the Narrator key 0 wherever it sits and the others 1 to 9 in order (decision F)', () => {
    const keys = folderVoices(tracks, 'c8', cast, { layout: 'folders', narratorCharacter: '', tracks: [] }).map((v) => [v.name, v.key]);
    expect(keys).toEqual([
      ['Alice', '1'],
      ['Narrator', '0'],
      ['Queen', '2'],
      ['Gardeners', '3'],
      ['Cheshire Cat', '4'],
    ]);
  });

  it("match a character by name, then by alias, and prefer the narrator's assignment", () => {
    const voices = folderVoices(tracks, 'c8', cast, {
      layout: 'folders',
      narratorCharacter: 'e-alice',
      tracks: [{ track: 'Gardeners', characters: ['e-two', 'missing'] }],
    });
    const by = Object.fromEntries(voices.map((v) => [v.name, v.characters.map((c) => `${c.name}:${c.source}`)]));
    expect(by).toEqual({
      Alice: ['Alice:name'],
      Narrator: ['Alice:assigned'],
      Queen: ['Queen of Hearts:alias'],
      Gardeners: ['Two:assigned', 'missing:assigned'],
      'Cheshire Cat': ['Cheshire Cat:name'],
    });
  });

  it('leave a key off past nine voices', () => {
    const many = [track('f', 'Ch', 0, true), ...Array.from({ length: 11 }, (_, i) => track(`v${i}`, `Voice ${i}`, 1))];
    expect(folderVoices(many, 'f', [], { layout: 'folders', narratorCharacter: '', tracks: [] }).map((v) => v.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '',
      '',
    ]);
  });

  it('give key 0 to the first Narrator only; a second one is an ordinary voice', () => {
    const twice = [track('f', 'Ch', 0, true), track('n1', 'Narrator', 1), track('x', 'Extras', 1), track('n2', 'narrator', 1)];
    expect(folderVoices(twice, 'f', cast, { layout: 'folders', narratorCharacter: '', tracks: [] }).map((v) => [v.name, v.key, v.narrator])).toEqual([
      ['Narrator', '0', true],
      ['Extras', '1', false],
      ['narrator', '2', false],
    ]);
  });
});
