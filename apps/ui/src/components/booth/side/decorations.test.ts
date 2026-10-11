import { describe, expect, it } from 'vitest';
import { boothDecorations, entityColour } from './decorations';
import { entities, paragraphs, spans } from './fixture';

describe('decorations come from the real data', () => {
  const { decorations, notes } = boothDecorations(paragraphs, entities, spans);

  it('tints each Story Bible name or alias by its category, whole words only', () => {
    const entityHits = decorations.filter((d) => d.kind === 'entity');
    expect(entityHits).toContainEqual({ paragraphId: 'p1', start: 4, end: 10, kind: 'entity', colour: '--place', title: 'Garden' });
    expect(entityHits.filter((d) => d.title === 'Queen')).toEqual([
      { paragraphId: 'p2', start: 30, end: 35, kind: 'entity', colour: '--character', title: 'Queen' },
    ]);
    expect(entityHits.some((d) => d.title === 'Alice' && d.paragraphId === 'p2')).toBe(true);
  });

  it('underlines the prep markup marks that still stand and drops stale ones', () => {
    const marks = decorations.filter((d) => d.kind === 'mark');
    expect(marks.map((d) => [d.paragraphId, d.start, d.end])).toEqual([
      ['p1', 4, 10],
      ['p1', 12, 16],
    ]);
  });

  it('shows a mark that carries text as a note under its paragraph', () => {
    expect(notes).toEqual([{ id: 's1', paragraphId: 'p1', name: 'Stress', text: 'lean on it' }]);
  });

  it('colours an unknown category with the accent', () => {
    expect(entityColour('Object')).toBe('--accent');
  });
});
