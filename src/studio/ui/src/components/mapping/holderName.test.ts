import { describe, expect, it } from 'vitest';
import { holderName, plainTrackChoices } from './trackChoices';
import type { Track } from '../../types';

// #3398: one rule for the name a "(linked to X)" label shows, in every picker.
describe('holderName', () => {
  it('prefers the manuscript’s name, then the kept title, then "another chapter"', () => {
    expect(holderName('Chapter 2', 'Old')).toBe('Chapter 2');
    expect(holderName(undefined, 'Kept')).toBe('Kept');
    expect(holderName('  ', '')).toBe('another chapter');
    expect(holderName(undefined, undefined)).toBe('another chapter');
  });
  it('makes control and direction characters spaces, and clips a long title', () => {
    expect(holderName(undefined, 'A‮B\nC\u0000D⁦E')).toBe('A B C D E');
    expect(holderName(undefined, 'x'.repeat(10000)).length).toBeLessThanOrEqual(60);
  });
  it('gives a held track a label in the pickers even when the kept title is empty', () => {
    const track = { guid: 'T', index: 0, name: 'One', color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [] } as unknown as Track;
    const [choice] = plainTrackChoices([track], [{ trackGuid: 'T', chapterId: 'c2', chapterTitle: '   ', confirmedAt: '' }], 'c1');
    expect(choice.heldBy).toBe('another chapter');
  });
});
