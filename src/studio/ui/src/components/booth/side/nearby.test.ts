import { describe, expect, it } from 'vitest';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { entities, garden, guideTypes, paragraphs, queen } from './fixture';
import { voicesInChapter } from './nearby';

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
