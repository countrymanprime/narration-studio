import { describe, expect, it } from 'vitest';
import { canSpeak, TYPE_COLOUR_VAR, typeColour, typeOf } from './storyBibleTypes';
import { GUIDE_TYPE_COLOURS, type GuideType } from './types';

const TYPES: GuideType[] = [
  { name: 'Person', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
  { name: 'Creature', colour: 'amber', speaks: true },
];

describe('the Story Bible types', () => {
  it('canSpeak and typeColour read the list, and an unknown type is faint and silent', () => {
    expect(canSpeak(TYPES, 'Person')).toBe(true);
    expect(canSpeak(TYPES, 'Creature')).toBe(true);
    expect(canSpeak(TYPES, 'Place')).toBe(false);
    expect(typeColour(TYPES, 'Creature')).toBe('amber');
    expect(typeColour(TYPES, 'Place')).toBe('blue');

    expect(typeOf(TYPES, 'Character')).toBeUndefined();
    expect(canSpeak(TYPES, 'Character')).toBe(false);
    expect(typeColour(TYPES, 'Character')).toBe('faint');
    expect(typeColour(TYPES, 'person')).toBe('faint');
  });

  it('draws the Story Bible’s own states in the review hue, and they never speak', () => {
    for (const state of ['Needs Review', 'Draft']) {
      expect(typeColour(TYPES, state)).toBe('review');
      expect(canSpeak(TYPES, state)).toBe(false);
    }
  });

  it('has a CSS colour for every type colour', () => {
    expect(Object.keys(TYPE_COLOUR_VAR).sort()).toEqual([...GUIDE_TYPE_COLOURS].sort());
  });
});
