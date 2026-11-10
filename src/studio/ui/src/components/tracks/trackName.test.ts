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
});
