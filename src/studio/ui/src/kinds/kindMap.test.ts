import { describe, expect, it } from 'vitest';
import { FAINT_COLOUR, WARN_COLOUR } from './entityColour';
import { KIND_IDS, MARKED_KIND_IDS, kindChipColors, kindColour, kindDef, kindFill, type KindId } from './kindMap';
import { kindMarkStyle } from './markStyle';

describe('the kind registry', () => {
  it('draws the mistake family red (D1), including a long silence (D4, the owner’s override)', () => {
    for (const id of ['misread', 'missing', 'extra', 'repeat', 'pacing'] as const) {
      expect(kindDef(id).hue, id).toBe('danger');
      expect(kindColour(id).line, id).toBe('--danger');
    }
  });

  it('draws breath, click, noise, plosive and low confidence amber, and pronunciation blue', () => {
    for (const id of ['breath', 'click', 'noise', 'plosive', 'low'] as const) expect(kindColour(id).line, id).toBe('--warn');
    expect(kindColour('pron').line).toBe('--info');
  });

  it('keeps the find hit on its own hue (D9)', () => {
    expect(kindColour('search').line).toBe('--search');
    expect(kindFill('search')).toBe('color-mix(in srgb, var(--search) 20%, transparent)');
  });

  it('draws a speaker in its entry’s colour, a suggested one dashed, an unknown one neutral and dashed (D6)', () => {
    expect(kindChipColors('speaker', WARN_COLOUR).text).toBe('var(--text)');
    expect(kindDef('speaker-suggested').dashed).toBe(true);
    // The neutral tone carries a soft-look rim since #2473 (XSE2-7); the unknown speaker is drawn dashed, which uses `line`, so nothing it draws changed.
    expect(kindChipColors('speaker-unknown')).toEqual({
      fill: 'var(--surface-2)',
      text: 'var(--text-muted)',
      line: 'var(--line-strong)',
      softLine: 'var(--border)',
    });
  });

  it('draws an entity with no colour in the faint fallback', () => {
    expect(kindColour('entity').line).toBe(FAINT_COLOUR.line);
  });

  it('has one id, one label and a chip shape for every kind', () => {
    const labels = KIND_IDS.map((id) => kindDef(id).label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of KIND_IDS) expect(['pill', 'tag'], id).toContain(kindDef(id).chip);
  });

  it('tells two kinds of one colour apart by shape: no two marks share a colour and a shape', () => {
    const seen = new Map<string, KindId>();
    for (const id of MARKED_KIND_IDS) {
      const { hue, mark } = kindDef(id);
      const key = `${hue}/${mark?.shape}`;
      expect(seen.get(key), `${id} and ${seen.get(key)} are both ${key}`).toBeUndefined();
      seen.set(key, id);
    }
  });
});

describe('kindMarkStyle', () => {
  it('has a style for exactly the kinds with a mark', () => {
    for (const id of KIND_IDS) expect(kindMarkStyle(id) !== undefined, id).toBe(kindDef(id).mark !== null);
  });

  it('draws each shape once', () => {
    expect(kindMarkStyle('misread')?.textDecoration).toBe('underline wavy var(--danger)');
    expect(kindMarkStyle('repeat')?.textDecoration).toBe('underline double var(--danger)');
    expect(kindMarkStyle('low')).toMatchObject({ textDecoration: 'underline solid var(--warn)', textDecorationThickness: '1px', background: 'transparent' });
    expect(kindMarkStyle('pron')?.textDecoration).toBe('underline dotted var(--info)');
    expect(kindMarkStyle('missing')).toMatchObject({ outline: '1.5px dashed var(--danger)', color: 'var(--text-muted)', background: 'transparent' });
    expect(kindMarkStyle('extra')).toMatchObject({ fontStyle: 'italic', boxShadow: 'inset 0.14em 0 0 var(--danger)', background: 'var(--danger-soft)' });
  });

  it('draws an entity as a tint with a 2px underline in its entry’s colour, the find hit with 1.5px', () => {
    expect(kindMarkStyle('entity', WARN_COLOUR)).toMatchObject({
      background: 'color-mix(in srgb, var(--warn) 20%, transparent)',
      boxShadow: 'inset 0 -2px 0 var(--warn)',
      color: 'var(--text)',
    });
    expect(kindMarkStyle('search')?.boxShadow).toBe('inset 0 -1.5px 0 var(--search)');
  });
});
