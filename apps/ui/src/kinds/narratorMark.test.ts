import { describe, expect, it } from 'vitest';
import { MARK_COLOURS, MARK_STYLES } from '../api/contracts/marks';
import { markToken, narratorMarkStyle } from './narratorMark';

describe('narratorMarkStyle', () => {
  it('draws every colour and style, and each colour has its own token', () => {
    expect(new Set(MARK_COLOURS.map(markToken)).size).toBe(MARK_COLOURS.length);
    for (const colour of MARK_COLOURS)
      for (const style of MARK_STYLES) expect(Object.keys(narratorMarkStyle(colour, style)).length, `${colour}/${style}`).toBeGreaterThan(0);
  });

  it('honours the style the narrator chose', () => {
    expect(narratorMarkStyle('bad', 'highlight')).toEqual({ background: 'color-mix(in srgb, var(--danger) 22%, transparent)' });
    expect(narratorMarkStyle('info', 'box').boxShadow).toBe('inset 0 0 0 1.5px var(--info)');
    expect(narratorMarkStyle('ok', 'underline')).toMatchObject({ textDecorationStyle: 'solid', textDecorationColor: 'var(--ok)' });
    for (const style of ['double', 'dotted', 'wavy'] as const) expect(narratorMarkStyle('warn', style).textDecorationStyle).toBe(style);
  });
});
