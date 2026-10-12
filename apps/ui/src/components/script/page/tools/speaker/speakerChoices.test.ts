import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity } from '../../../../../api/contracts/storyBible';
import { speakerColorIndex } from '../../../../primitives/speakerColor';
import { searchSpeakers, speakerChoices, speakersInChapter } from './speakerChoices';

const entry = (id: string, name: string, extra: Partial<GuideEntity> = {}): GuideEntity =>
  ({ id, canonical_name: name, aliases: [], category: 'Character', ...extra }) as GuideEntity;
const alias = (text: string) => ({ text, pronunciation: {}, occurrences: [] }) as unknown as GuideEntity['aliases'][number];
const cue = (id: string, chapterId: string, speaker: string | null): GuideDialogueCue =>
  ({
    id,
    chapterId,
    paragraphId: `${chapterId}-p`,
    quote_start: 0,
    quote_end: 1,
    quote_text: '"x"',
    speaker_entity_id: speaker,
    speaker_source: 'rules',
    corrected: false,
  }) as unknown as GuideDialogueCue;

const duchess = entry('e1', 'The Duchess', { aliases: [alias('Her Grace')], speaker_color: 5 });
const hatter = entry('e2', 'The Hatter');
const garden = entry('e3', 'The Garden', { category: 'Place' });
const entries = [duchess, hatter, garden];

describe('speakerChoices', () => {
  it('lists every name of each speaking entry, with the entry beneath and its colour', () => {
    expect(speakerChoices(entries)).toEqual([
      { entryId: 'e1', name: 'The Duchess', entryName: 'The Duchess', colourIndex: 5 },
      { entryId: 'e1', name: 'Her Grace', entryName: 'The Duchess', colourIndex: 5 },
      { entryId: 'e2', name: 'The Hatter', entryName: 'The Hatter', colourIndex: speakerColorIndex('e2') },
    ]);
  });

  it('leaves out places and other categories that cannot speak', () => {
    expect(speakerChoices(entries).map((c) => c.entryId)).not.toContain('e3');
  });

  it('gives a name two entries share to the first, ignoring case and blank names', () => {
    const twin = entry('e4', 'the hatter', { aliases: [alias('  ')] });
    expect(speakerChoices([hatter, twin]).map((c) => c.entryId)).toEqual(['e2']);
  });

  it('has no narrator choice', () => {
    expect(searchSpeakers(speakerChoices(entries), 'narr')).toEqual([]);
  });
});

describe('speakersInChapter', () => {
  it('has the entries that speak in the chapter', () => {
    const found = speakersInChapter(entries, [cue('q1', 'c1', 'e2'), cue('q2', 'c2', 'e1')], [{ text: 'Nothing named.' }], 'c1');
    expect(found.map((c) => c.entryId)).toEqual(['e2']);
  });

  it('adds the entries named in its text, by any of their names', () => {
    const found = speakersInChapter(entries, [], [{ text: 'Her Grace sneezed.' }], 'c1');
    expect(found.map((c) => c.name)).toEqual(['The Duchess', 'Her Grace']);
  });

  it('ignores a cue with no speaker', () => {
    expect(speakersInChapter(entries, [cue('q', 'c1', null)], [{ text: '' }], 'c1')).toEqual([]);
  });
});

describe('searchSpeakers', () => {
  it('matches the name or its entry, ignoring case', () => {
    const all = speakerChoices(entries);
    expect(searchSpeakers(all, 'grace').map((c) => c.name)).toEqual(['Her Grace']);
    expect(searchSpeakers(all, 'DUCHESS').map((c) => c.name)).toEqual(['The Duchess', 'Her Grace']);
  });
});
