import { describe, expect, it } from 'vitest';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideDialogueCue, GuideEntity } from '../../../../api/contracts/storyBible';
import { buildLayerIndex, composeLayers, paragraphLayers, type Layer } from './layers';
import { cue, entry, flaggedWord, mark, paragraph, TYPES } from './readerFixtures';

const text = 'Mina said, "Come along," and left the harbour.';
const range = (needle: string): { start: number; end: number } => ({ start: text.indexOf(needle), end: text.indexOf(needle) + needle.length });

const markLayer = (id: string, needle: string): Layer => ({
  kind: 'mark',
  id,
  ...range(needle),
  colour: 'info',
  style: 'underline',
  ask: false,
  note: false,
  name: 'Note',
});
const nameLayer = (needle: string): Layer => ({ kind: 'name', entryId: 'e1', entryKind: 'Character', ...range(needle) });

describe('composeLayers', () => {
  it('rebuilds the paragraph text however the layers overlap', () => {
    const pieces = composeLayers(text, [markLayer('a', 'said, "Come'), nameLayer('Mina said'), markLayer('b', 'along')]);
    expect(pieces.map((piece) => piece.text).join('')).toBe(text);
  });

  it('puts the shorter layer inside the longer one', () => {
    const pieces = composeLayers(text, [markLayer('short', 'said'), markLayer('long', 'Mina said, "Come along,"')]);
    const said = pieces.find((piece) => piece.text === 'said');
    expect(said?.layers.map((layer) => (layer.kind === 'mark' ? layer.id : ''))).toEqual(['long', 'short']);
  });

  it('draws speaker phrases outside, find matches inside', () => {
    const phrase: Layer = { kind: 'phrase', cueId: 'c1', speakerId: 'e1', colourIndex: 2, label: 'Mina', state: 'confirmed', ...range('"Come along,"') };
    const find: Layer = { kind: 'find', current: true, ...range('along') };
    const pieces = composeLayers(text, [find, markLayer('m', '"Come along,"'), phrase]);
    const along = pieces.find((piece) => piece.text === 'along');
    expect(along?.layers.map((layer) => layer.kind)).toEqual(['phrase', 'mark', 'find']);
  });

  it('clamps offsets to the text and drops an empty or non-numeric range', () => {
    const wild: Layer[] = [
      { kind: 'find', current: false, start: -5, end: 4 },
      { kind: 'find', current: false, start: text.length - 3, end: text.length + 50 },
      { kind: 'find', current: false, start: 7, end: 7 },
      { kind: 'find', current: false, start: Number.NaN, end: 9 },
    ];
    const pieces = composeLayers(text, wild);
    expect(pieces.map((piece) => piece.text).join('')).toBe(text);
    expect(pieces.filter((piece) => piece.layers.length).map((piece) => piece.text)).toEqual(['Mina', 'ur.']);
  });

  it('marks the first piece of a phrase', () => {
    const phrase: Layer = { kind: 'phrase', cueId: 'c1', speakerId: null, colourIndex: 1, label: '?', state: 'unknown', ...range('"Come along,"') };
    const pieces = composeLayers(text, [phrase, markLayer('m', 'along')]);
    expect(pieces.filter((piece) => piece.chipFor).map((piece) => piece.text)).toEqual(['"Come ']);
  });
});

describe('paragraphLayers', () => {
  const para = paragraph('p1', 'c1', text);
  const entries: GuideEntity[] = [entry('e1', 'Mina', 'Character', 4), entry('e2', 'Harbour', 'Place')];
  const cues: GuideDialogueCue[] = [
    cue('q1', 'p1', 'c1', range('"Come along,"'), 'e1', 'correction'),
    cue('q2', 'p9', 'c1', { start: 0, end: 3 }, null, 'tag'),
  ];
  const marks: Mark[] = [mark('m1', 'p1', range('left'), 'ask'), mark('m2', 'p1', range('Mina'), 'note', { stale: true })];
  const words: ScriptWord[] = [flaggedWord('harbour', 'p1', range('harbour'))];
  const index = buildLayerIndex({ marks, markTypes: TYPES as MarkType[], words, entries, cues });

  it('turns each source into a layer of this paragraph only', () => {
    const kinds = paragraphLayers(index, para).map((layer) => layer.kind);
    expect(kinds.sort()).toEqual(['mark', 'name', 'name', 'phrase', 'word']);
  });

  it('skips a stale mark: its offsets may no longer fit the words', () => {
    const ids = paragraphLayers(index, para).flatMap((layer) => (layer.kind === 'mark' ? [layer.id] : []));
    expect(ids).toEqual(['m1']);
  });

  it('takes the mark colour, line style and ask flag from the mark type', () => {
    const layer = paragraphLayers(index, para).find((l) => l.kind === 'mark');
    expect(layer).toMatchObject({ colour: 'warn', style: 'wavy', ask: true });
  });

  it('gives a confirmed speaker the entry colour override', () => {
    const layer = paragraphLayers(index, para).find((l) => l.kind === 'phrase');
    expect(layer).toMatchObject({ cueId: 'q1', state: 'confirmed', colourIndex: 4, label: 'Mina' });
  });

  it('draws an unattributed phrase as unknown with a question mark', () => {
    const idx = buildLayerIndex({ marks: [], markTypes: [], words: [], entries, cues: [cue('q3', 'p1', 'c1', range('"Come along,"'), null, 'tag')] });
    expect(paragraphLayers(idx, para).find((l) => l.kind === 'phrase')).toMatchObject({ state: 'unknown', label: '?' });
  });

  it('draws a suggested speaker as a suggestion', () => {
    const idx = buildLayerIndex({ marks: [], markTypes: [], words: [], entries, cues: [cue('q4', 'p1', 'c1', range('"Come along,"'), 'e1', 'tag')] });
    expect(paragraphLayers(idx, para).find((l) => l.kind === 'phrase')).toMatchObject({ state: 'suggested' });
  });
});
