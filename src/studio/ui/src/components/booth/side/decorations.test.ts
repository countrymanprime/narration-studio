import { describe, expect, it } from 'vitest';
import { typeHueColour } from '../../../kinds/entityColour';
import { boothDecorations, markAtWord, markNote } from './decorations';
import { entities, guideTypes, marks, paragraphs } from './fixture';

describe('decorations come from the real data', () => {
  const { decorations, notes } = boothDecorations(paragraphs, entities, marks, guideTypes);

  it('tints each Story Bible name or alias by its category, whole words only', () => {
    const entityHits = decorations.filter((d) => d.kind === 'entity');
    expect(entityHits).toContainEqual({ paragraphId: 'p1', start: 4, end: 10, kind: 'entity', colour: typeHueColour('blue'), title: 'Garden' });
    expect(entityHits.filter((d) => d.title === 'Queen')).toEqual([
      { paragraphId: 'p2', start: 30, end: 35, kind: 'entity', colour: typeHueColour('green'), title: 'Queen' },
    ]);
    expect(entityHits.some((d) => d.title === 'Alice' && d.paragraphId === 'p2')).toBe(true);
  });

  it('draws the marks that still stand in their type colour and chosen style, and drops stale ones (D8)', () => {
    const drawn = decorations.filter((d) => d.kind === 'mark');
    expect(drawn.map((d) => [d.paragraphId, d.start, d.end, d.colour, d.kind === 'mark' ? d.style : '', d.title])).toEqual([
      ['p1', 4, 10, 'copper', 'highlight', 'Word stress'],
      ['p1', 11, 14, 'info', 'dotted', 'Breath / pause'],
      ['p2', 42, 45, 'warn', 'highlight', 'Query for author'],
    ]);
  });

  it('shows a mark that carries text as a note under its paragraph, but not a question to the author', () => {
    expect(notes).toEqual([{ id: 'm1', paragraphId: 'p1', name: 'Word stress', text: 'lean on it', colour: 'copper' }]);
  });

  it('finds the mark on a clicked word, and none on a plain word or a stale mark', () => {
    expect(markAtWord(paragraphs, marks, 'p1', 1)?.id).toBe('m1');
    expect(markAtWord(paragraphs, marks, 'p1', 3)).toBeUndefined();
    expect(markAtWord(paragraphs, marks, 'p2', 0)).toBeUndefined();
  });

  it('a mark reads as its type, its words and its thread after its own text', () => {
    expect(markNote(marks.marks[0]!, marks)).toEqual({
      name: 'Word stress',
      quote: 'Garden',
      messages: [{ text: 'lean on it' }, { who: 'Author', text: 'yes' }],
    });
  });

  it('colours a name of a type nobody defines in the fallback colour', () => {
    const odd = { ...entities[0]!, category: 'Object' };
    expect(boothDecorations(paragraphs, [odd], marks, guideTypes).decorations.find((d) => d.kind === 'entity')?.colour.hue).toBe('faint');
  });
});
