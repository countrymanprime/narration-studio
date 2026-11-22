import { describe, expect, it } from 'vitest';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { entities, garden, guideTypes, paragraphs, queen } from './fixture';
import { comingUpWords, linesInChapter, voicesInChapter } from './nearby';
import { boothDecorations } from './decorations';

const units = (list: readonly ReadingParagraph[]) => boothUnits(list);

describe('who is in the chapter (not who speaks near the reading)', () => {
  it('lists-every-character-the-chapter-names-or-gives-a-line-to-in-the-order-they-first-appear', () => {
    const text: ReadingParagraph[] = [
      { id: 'a', text: 'Alice came in. The Queen watched.' },
      { id: 'b', text: 'Later the Queen left.' },
    ];
    expect(voicesInChapter(text, units(text), entities, guideTypes).map((voice) => voice.name)).toEqual(['Alice', 'Queen']);
  });

  it('includes-someone-who-is-only-named-and-never-speaks', () => {
    const text: ReadingParagraph[] = [{ id: 'a', text: 'Nobody spoke of the Queen.' }];
    const [voice] = voicesInChapter(text, units(text), entities, guideTypes);
    expect(voice).toMatchObject({ name: 'Queen', aliases: ['Queen'], voice: 'Clipped and loud. Never asks twice.' });
  });

  it('does-not-list-a-place-or-a-character-who-is-not-in-the-chapter', () => {
    const names = voicesInChapter(paragraphs, units(paragraphs), entities, guideTypes).map((voice) => voice.name);
    expect(names).not.toContain(garden.canonical_name);
    const none: ReadingParagraph[] = [{ id: 'a', text: 'Nothing here.' }];
    expect(voicesInChapter(none, units(none), entities, guideTypes)).toEqual([]);
  });

  it('finds-someone-by-an-alias-and-lists-the-labels-the-chapter-speaks-them-under', () => {
    const text: ReadingParagraph[] = [{ id: 'a', text: '“Off with her head,” said Her Majesty.' }];
    const [voice] = voicesInChapter(text, units(text), [queen], guideTypes);
    expect(voice.name).toBe('Queen');
    expect(voice.aliases).toEqual(['Queen']);
  });

  it('a-name-inside-another-word-is-not-a-mention', () => {
    const text: ReadingParagraph[] = [{ id: 'a', text: 'The Queenly manner and the Alicexyz case.' }];
    expect(voicesInChapter(text, units(text), entities, guideTypes)).toEqual([]);
  });

  it('a-name-with-regex-characters-and-an-empty-chapter-do-not-throw', () => {
    const odd = { ...queen, id: 'x', canonical_name: 'Dr. (Who)+', aliases: [] } as GuideEntity;
    const text: ReadingParagraph[] = [{ id: 'a', text: 'Dr. (Who)+ arrived. 😀 שלום' }];
    expect(voicesInChapter(text, units(text), [odd], guideTypes).map((voice) => voice.name)).toEqual(['Dr. (Who)+']);
    expect(voicesInChapter([], [], entities, guideTypes)).toEqual([]);
  });
});

describe('the lines each character speaks in the chapter', () => {
  it('counts-each-quotation-once-by-the-character-its-speaker-names', () => {
    const unit = (key: string, speaker: string, quoted: boolean, cont = false) => ({
      key,
      paragraphId: 'a',
      paragraphIndex: 0,
      start: 0,
      end: 1,
      speaker,
      quoted,
      confirmed: true,
      text: 'x',
      words: 1,
      cont,
    });
    const lines = linesInChapter(
      [unit('1', 'Queen', true), unit('2', 'Queen', true, true), unit('3', 'Queen', true), unit('4', '', false), unit('5', 'Nobody', true)],
      entities,
    );
    expect([...lines]).toEqual([[queen.id, 2]]);
  });
});

describe('one list of names (#3970)', () => {
  // A speaking type that is not called "Character": the highlights drew her, but the cast list skipped her.
  const person = [{ name: 'Person', colour: 'green' as const, speaks: true }];
  const mara = { ...queen, id: 'mara', canonical_name: 'Mara', aliases: [], category: 'Person' } as GuideEntity;
  const text: ReadingParagraph[] = [{ id: 'a', text: 'Mara said nothing. mara is not a name here.' }];

  it('a-character-of-any-speaking-type-named-only-in-narration-is-in-the-chapter-the-highlights-draw-and-coming-up-lists-her', () => {
    expect(voicesInChapter(text, units(text), [mara], person).map((voice) => voice.name)).toEqual(['Mara']);
    expect(boothDecorations(text, [mara], { types: [], marks: [] }, person).decorations.map((d) => d.title)).toEqual(['Mara']);
    expect(comingUpWords(units(text), 0, [mara]).map((word) => word.word)).toEqual(['Mara']);
  });

  it('a-lowercase-spelling-is-not-her-in-any-of-the-three', () => {
    const lower: ReadingParagraph[] = [{ id: 'a', text: 'mara is not a name here.' }];
    expect(voicesInChapter(lower, units(lower), [mara], person)).toEqual([]);
    expect(boothDecorations(lower, [mara], { types: [], marks: [] }, person).decorations).toEqual([]);
    expect(comingUpWords(units(lower), 0, [mara])).toEqual([]);
  });
});
