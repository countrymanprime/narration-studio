import { describe, expect, it } from 'vitest';
import { makeChapters } from '../../fixtures/chapters';
import type { ManuscriptChapter, MeasureFileResult } from '../../types';
import { chapterForFile, chapterOfFile, fileOf } from './chapterFile';

const chapter = (index: number, title: string) => ({ id: `c${index}`, title, index }) as Pick<ManuscriptChapter, 'title' | 'index'> & { id: string };
const file = (name: string) => ({ name }) as MeasureFileResult;

describe('chapterFile', () => {
  it("matches a chapter's file by its title or its number, as Delivery did", () => {
    const chapters = [chapter(0, 'Down the Rabbit-Hole'), chapter(3, 'Another title'), chapter(4, 'Another title'), chapter(9, 'Nope'), chapter(11, 'Nope')];
    const files = [file('Down the Rabbit-Hole.wav'), file('Chapter 04.wav'), file('Chapter 12 and 3.wav')];
    expect(fileOf(chapters[0]!, files, chapters)).toBe(files[0]);
    // The index counts from 0 and the number in a name from 1: "Chapter 04" is the chapter at index 3, not 4.
    expect(fileOf(chapters[1]!, files, chapters)).toBe(files[1]);
    expect(fileOf(chapters[2]!, files, chapters)).toBeUndefined();
    // A name with two numbers is nobody's by number.
    expect(fileOf(chapters[3]!, files, chapters)).toBeUndefined();
    expect(fileOf(chapters[4]!, files, chapters)).toBeUndefined();
  });

  it('goes the other way: the chapter a file belongs to', () => {
    const chapters = [chapter(0, 'One'), chapter(3, 'Four')];
    expect(chapterOfFile(file('Chapter 04.wav'), chapters)).toBe(chapters[1]);
    expect(chapterOfFile(file('Retail.wav'), chapters)).toBeUndefined();
  });

  it('gives "Chapter 10.wav" to the Chapter 10 row only, in both directions', () => {
    const chapters = [chapter(0, 'Chapter 1'), chapter(9, 'Chapter 10'), chapter(10, 'Chapter 11')];
    const files = [file('Chapter 10.wav'), file('Chapter 1.wav')];
    expect(chapterOfFile(files[0]!, chapters)).toBe(chapters[1]);
    expect(fileOf(chapters[0]!, files, chapters)).toBe(files[1]);
    expect(fileOf(chapters[1]!, files, chapters)).toBe(files[0]);
    expect(fileOf(chapters[2]!, files, chapters)).toBeUndefined();
  });

  it('keeps "Part 1" and "Part 10" apart', () => {
    const chapters = [chapter(0, 'Part 1'), chapter(1, 'Part 10')];
    expect(chapterOfFile(file('Part 10 - final.wav'), chapters)).toBe(chapters[1]);
    expect(chapterOfFile(file('Part 1 (take 2).wav'), chapters)).toBe(chapters[0]);
    expect(chapterOfFile(file('Book Part 1.wav'), chapters)).toBe(chapters[0]);
  });
});

describe('chapterForFile: one chapter per file, by whole-word title or number, the longest title winning', () => {
  const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 100 });
  const idOf = (name: string) => chapterForFile(file(name), chapters)?.id;

  it('maps Chapter 1, 10, 100 and a retake to their own chapters, never to a chapter whose title is a prefix', () => {
    expect(idOf('Chapter 1.wav')).toBe('chapter-1');
    expect(idOf('Chapter 10.wav')).toBe('chapter-10');
    expect(idOf('Chapter 11.wav')).toBe('chapter-11');
    expect(idOf('Chapter 100 final.wav')).toBe('chapter-100');
    expect(idOf('Chapter 1 retake.wav')).toBe('chapter-1');
    expect(idOf('Chapter 1 - take 2.wav')).toBe('chapter-1');
    expect(idOf('CHAPTER 19 (mastered).wav')).toBe('chapter-19');
  });
  it('reads a file named by its number alone as that chapter', () => {
    expect(idOf('07.wav')).toBe('chapter-7');
    expect(idOf('Ch 12.wav')).toBe('chapter-12');
  });
  it('gives no chapter to a name that fits two chapters equally well, or none', () => {
    const twins = [
      { ...chapters[0]!, id: 'a', title: 'Interlude', index: 0 },
      { ...chapters[1]!, id: 'b', title: 'Interlude', index: 1 },
    ];
    expect(chapterForFile(file('Interlude.wav'), twins)).toBeUndefined();
    expect(idOf('Epilogue.wav')).toBeUndefined();
    expect(idOf('Chapter 1 and Chapter 2.wav')).toBeUndefined();
  });
});
