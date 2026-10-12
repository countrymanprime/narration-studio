import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter, MeasureFileResult } from '../../types';
import { chapterOfFile, fileOf } from './chapterFile';

const chapter = (index: number, title: string) => ({ id: `c${index}`, title, index }) as Pick<ManuscriptChapter, 'title' | 'index'> & { id: string };
const file = (name: string) => ({ name }) as MeasureFileResult;

describe('chapterFile', () => {
  it("matches a chapter's file by its title or its number, as Delivery did", () => {
    const files = [file('Down the Rabbit-Hole.wav'), file('Chapter 04.wav'), file('Chapter 12 and 3.wav')];
    expect(fileOf(chapter(1, 'Down the Rabbit-Hole'), files)).toBe(files[0]);
    expect(fileOf(chapter(4, 'Another title'), files)).toBe(files[1]);
    // A name with two numbers is nobody's by number.
    expect(fileOf(chapter(12, 'Nope'), files)).toBeUndefined();
    expect(fileOf(chapter(9, 'Nope'), files)).toBeUndefined();
  });

  it('goes the other way: the chapter a file belongs to', () => {
    const chapters = [chapter(1, 'One'), chapter(4, 'Four')];
    expect(chapterOfFile(file('Chapter 04.wav'), chapters)).toBe(chapters[1]);
    expect(chapterOfFile(file('Retail.wav'), chapters)).toBeUndefined();
  });
});
