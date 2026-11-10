import { describe, expect, it } from 'vitest';
import { trackName } from './trackName';

describe('trackName', () => {
  it('keeps a name the narrator gave', () => {
    expect(trackName('Chapter 1', 0)).toBe('Chapter 1');
    expect(trackName('Alice')).toBe('Alice');
  });
  it('names a blank track by its place when the place is known', () => {
    expect([trackName('', 0), trackName('', 2), trackName('   ', 9)]).toEqual(['Track 1', 'Track 3', 'Track 10']);
  });
  it('says Unnamed track when only the name is known', () => {
    expect([trackName(''), trackName('  ')]).toEqual(['Unnamed track', 'Unnamed track']);
  });
  it('trims the name it keeps, so a stray space never reads as a different track', () => {
    expect(trackName(' Alice ', 0)).toBe('Alice');
  });
  it.each(['\u200B', '\uFEFF', '\u200D', '\u200E', '\u2800', '\u3164', '\u00AD', ' \u200B '])('reads %j as blank', (invisible) => {
    expect(trackName(invisible, 4)).toBe('Track 5');
    expect(trackName(invisible)).toBe('Unnamed track');
  });
  it('reads a name the host did not send as blank, and never throws', () => {
    expect(trackName(undefined as unknown as string, 0)).toBe('Track 1');
    expect(trackName(null as unknown as string)).toBe('Unnamed track');
  });
  it('treats an index that is not a non-negative whole number as unknown', () => {
    for (const bad of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY, '2' as unknown as number]) expect(trackName('', bad)).toBe('Unnamed track');
    expect(trackName('', 0)).toBe('Track 1');
  });
  it('keeps a name that only looks like a placeholder', () => {
    expect(trackName('Track 3', 7)).toBe('Track 3');
  });
});
