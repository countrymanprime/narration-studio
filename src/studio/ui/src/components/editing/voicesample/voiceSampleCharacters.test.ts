// The state matrix (definition of done, rule 3) for the dialog's character list, written before the code: a pure function of the Story Bible's
// entries and dialogue cues, the chapter and the first selected word.
//
//   empty                          'with no Story Bible there is only Narration'
//   one, many                      'the speakers of this chapter come first, then every other character, then Narration'
//   not characters                 'only characters are offered'
//   unknown speakers               'a cue with no speaker, or a speaker the Story Bible lost, adds nobody'
//   other chapters                 'a speaker of another chapter is under all characters'
//   long, right-to-left, emoji     'names in any script are listed as given, sorted by name'
//   preselect                      'the speaker of the quote the first word is in', 'a word outside every quote opens on the first speaker of the chapter', 'with no characters it is Narration'
//   rapid double-fire, reload,
//   leave mid-action               not tested: a pure function holds no state
import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity } from '../../../api/contracts/storyBible';
import { characterChoices, speakerOfWord } from './voiceSampleCharacters';

const entity = (id: string, name: string, category = 'Character'): GuideEntity => ({ id, canonical_name: name, category }) as GuideEntity;
const cue = (id: string, chapterId: string, paragraphId: string, start: number, end: number, speaker: string | null): GuideDialogueCue =>
  ({ id, chapterId, paragraphId, quote_start: start, quote_end: end, quote_text: '', speaker_entity_id: speaker }) as GuideDialogueCue;

const ENTITIES = [
  entity('e-hatter', 'The Hatter'),
  entity('e-alice', 'Alice'),
  entity('e-queen', 'The Queen of Hearts'),
  entity('e-wonderland', 'Wonderland', 'Place'),
];

describe('characterChoices', () => {
  it('with no Story Bible there is only Narration', () => {
    expect(characterChoices([], [], 'c-1')).toEqual([{ id: 'narration', name: 'Narration' }]);
  });

  it('the speakers of this chapter come first, then every other character, then Narration', () => {
    const cues = [cue('1', 'c-1', 'p-1', 0, 10, 'e-queen'), cue('2', 'c-1', 'p-2', 0, 10, 'e-alice')];
    expect(characterChoices(ENTITIES, cues, 'c-1')).toEqual([
      { id: 'e-alice', name: 'Alice', group: 'In this chapter' },
      { id: 'e-queen', name: 'The Queen of Hearts', group: 'In this chapter' },
      { id: 'e-hatter', name: 'The Hatter', group: 'All characters' },
      { id: 'narration', name: 'Narration' },
    ]);
  });

  it('only characters are offered', () => {
    expect(characterChoices(ENTITIES, [], 'c-1').map((c) => c.id)).not.toContain('e-wonderland');
  });

  it('a cue with no speaker, or a speaker the Story Bible lost, adds nobody', () => {
    const cues = [cue('1', 'c-1', 'p-1', 0, 10, null), cue('2', 'c-1', 'p-1', 12, 20, 'e-gone')];
    expect(characterChoices(ENTITIES, cues, 'c-1').filter((c) => c.group === 'In this chapter')).toEqual([]);
  });

  it('a speaker of another chapter is under all characters', () => {
    const choices = characterChoices(ENTITIES, [cue('1', 'c-9', 'p-1', 0, 10, 'e-queen')], 'c-1');
    expect(choices.find((c) => c.id === 'e-queen')?.group).toBe('All characters');
  });

  it('names in any script are listed as given, sorted by name', () => {
    const names = [entity('e-1', 'שלום'), entity('e-2', '🦎 Lizard'), entity('e-3', 'Bill the Lizard'.repeat(5))];
    expect(characterChoices(names, [], 'c-1').map((c) => c.name)).toEqual(['🦎 Lizard', 'Bill the Lizard'.repeat(5), 'שלום', 'Narration']);
  });
});

describe('speakerOfWord', () => {
  const paragraphs = [{ id: 'p-1', text: '"Off with his head!" cried the Queen.' }];
  const cues = [cue('1', 'c-1', 'p-1', 0, 20, 'e-queen')];

  it('the speaker of the quote the first word is in', () => {
    expect(speakerOfWord(cues, paragraphs, 'c-1', 'p-1:1', ENTITIES)).toBe('e-queen');
  });

  it('a word outside every quote opens on the first speaker of the chapter', () => {
    expect(speakerOfWord(cues, paragraphs, 'c-1', 'p-1:5', ENTITIES)).toBeUndefined();
  });

  it('a said word, a missing paragraph and a quote of another chapter name nobody', () => {
    expect(speakerOfWord(cues, paragraphs, 'c-1', 'p-1:x0', ENTITIES)).toBeUndefined();
    expect(speakerOfWord(cues, paragraphs, 'c-1', 'p-9:0', ENTITIES)).toBeUndefined();
    expect(speakerOfWord(cues, paragraphs, 'c-2', 'p-1:1', ENTITIES)).toBeUndefined();
  });

  it('a speaker the Story Bible lost is not preselected', () => {
    expect(speakerOfWord([cue('1', 'c-1', 'p-1', 0, 20, 'e-gone')], paragraphs, 'c-1', 'p-1:1', ENTITIES)).toBeUndefined();
  });
});
