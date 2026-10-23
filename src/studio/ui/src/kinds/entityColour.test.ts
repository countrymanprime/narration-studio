import { describe, expect, it } from 'vitest';
import { GUIDE_TYPE_COLOURS, type GuideType } from '../types';
import { ALL_ENTITY_COLOURS, ENTITY_HUES, FAINT_COLOUR, WARN_COLOUR, entryColour, speakerColour, tint, tintOver, typeHueColour } from './entityColour';

const TYPES: GuideType[] = [
  { name: 'Person', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
  { name: 'Creature', colour: 'amber', speaks: true },
];

describe('entryColour', () => {
  it('draws an entry in its type colour', () => {
    expect(entryColour(TYPES, 'Person')).toEqual({ hue: 'character', line: '--character', text: '--character-text' });
    expect(entryColour(TYPES, 'Place').line).toBe('--place');
    expect(entryColour(TYPES, 'Creature').line).toBe('--lore');
  });

  it('follows a type the narrator recoloured', () => {
    expect(entryColour([{ name: 'Person', colour: 'rose', speaks: true }], 'Person').line).toBe('--event');
  });

  it('draws Needs Review and Draft in warn, freeing --review (D7)', () => {
    expect(entryColour(TYPES, 'Needs Review')).toBe(WARN_COLOUR);
    expect(entryColour(TYPES, 'Draft')).toBe(WARN_COLOUR);
  });

  it('draws a type nobody defines (or a deleted one) in the one faint fallback', () => {
    for (const category of ['Spaceship', '', '🦎', 'شخصية']) expect(entryColour(TYPES, category)).toBe(FAINT_COLOUR);
    expect(entryColour([], 'Person')).toBe(FAINT_COLOUR);
  });

  it('has a hue for every type colour the Settings picker offers', () => {
    for (const colour of GUIDE_TYPE_COLOURS) expect(ENTITY_HUES, colour).toContain(typeHueColour(colour).hue);
  });
});

describe('speakerColour', () => {
  it("uses the entry's own pick, 1..7", () => {
    expect(speakerColour(TYPES, { category: 'Person', speakerColor: 4 })).toEqual({ hue: 'speaker-4', line: '--speaker-4', text: '--speaker-4-text' });
  });

  it("falls back to the entry's type colour: no id hash, so a character has one colour (D6)", () => {
    expect(speakerColour(TYPES, { category: 'Person' })?.line).toBe('--character');
    expect(speakerColour(TYPES, { category: 'Person', speakerColor: 8 })?.line).toBe('--character');
    expect(speakerColour(TYPES, { category: 'Person', speakerColor: 0 })?.line).toBe('--character');
    expect(speakerColour(TYPES, { category: 'Person', speakerColor: 2.5 })?.line).toBe('--character');
    expect(speakerColour(TYPES, { category: 'Person', speakerColor: Number.NaN })?.line).toBe('--character');
  });

  it('gives a narrator or an unknown speaker no hue', () => {
    expect(speakerColour(TYPES, undefined)).toBeNull();
  });
});

describe('the tint helper (D13)', () => {
  it('mixes with transparent, or over a surface', () => {
    expect(tint('--place', 20)).toBe('color-mix(in srgb, var(--place) 20%, transparent)');
    expect(tintOver('--lore', 18)).toBe('color-mix(in srgb, var(--lore) 18%, var(--surface))');
    expect(tintOver('--lore', 18, '--surface-2')).toBe('color-mix(in srgb, var(--lore) 18%, var(--surface-2))');
  });

  it('lists every colour an entity can be drawn in once', () => {
    const hues = ALL_ENTITY_COLOURS.map((colour) => colour.hue);
    expect(new Set(hues).size).toBe(hues.length);
    expect(hues).toEqual([...ENTITY_HUES, 'warn', 'faint']);
  });
});
