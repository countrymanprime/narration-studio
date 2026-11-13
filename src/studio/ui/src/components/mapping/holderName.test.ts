import { describe, expect, it } from 'vitest';
import { heldLabel, holderName, holderOf, plainTrackChoices } from './trackChoices';
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
    expect(holderName(undefined, 'x'.repeat(10000)).length).toBeLessThanOrEqual(80);
  });
  it('treats a title made only of invisible characters as no title', () => {
    for (const invisible of ['\u200b', '\u2800', '\u3164', '\u00ad', '\u200d\u200c', '\ufeff']) {
      expect(holderName(invisible, 'Kept')).toBe('Kept');
      expect(holderName(invisible, invisible)).toBe('another chapter');
    }
  });
  it('gives a held track a label in the pickers even when the kept title is empty', () => {
    const track = { guid: 'T', index: 0, name: 'One', color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [] } as unknown as Track;
    const [choice] = plainTrackChoices([track], [{ trackGuid: 'T', chapterId: 'c2', chapterTitle: '   ' }], 'c1');
    expect(choice.heldBy).toBe('another chapter');
  });
  it('names the holder by the manuscript’s current heading when the caller has it, else the kept title', () => {
    const track = { guid: 'T', index: 0, name: 'One', color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [] } as unknown as Track;
    const links = [{ trackGuid: 'T', chapterId: 'c2', chapterTitle: 'Chapter 2' }];
    const nameOf = (id: string) => (id === 'c2' ? 'Chapter 2: The Pool of Tears' : undefined);
    expect(plainTrackChoices([track], links, 'c1', nameOf)[0].heldBy).toBe('Chapter 2: The Pool of Tears');
    expect(plainTrackChoices([track], links, 'c1', () => undefined)[0].heldBy).toBe('Chapter 2');
  });
  it('writes the "(linked to X)" template in one place', () => {
    expect(heldLabel('Chapter 1')).toBe('Chapter 1');
    expect(heldLabel('Chapter 1', 'Chapter 2')).toBe('Chapter 1 (linked to Chapter 2)');
  });
  it('finds a holder among every link, including a chapter’s second link, and never the chapter itself', () => {
    const links = [
      { trackGuid: 'A', chapterId: 'c1' },
      { trackGuid: 'B', chapterId: 'c1' },
      { trackGuid: 'B', chapterId: 'c2' },
    ];
    expect(holderOf(links, 'B', 'c1')?.chapterId).toBe('c2');
    expect(holderOf(links, 'A', 'c1')).toBeUndefined();
    expect(holderOf(links, 'B', 'c3')?.chapterId).toBe('c1');
  });
});
