import { describe, expect, it } from 'vitest';
import { ARABIC_NAMES, CHAPTER_TITLES, swapNames } from './rtlNames';

// The sweep's name swap (toast-rtl-sweep.spec.ts) must say so when a name it renames is no longer in the app chunk.
const CHUNK = [...Object.keys(CHAPTER_TITLES).map((number) => `{title:\`Chapter ${number}\`}`), ...Object.keys(ARABIC_NAMES)].join(';');

describe('swapNames', () => {
  it('swaps every name and reports nothing missing when the chunk holds them all', () => {
    const { body, unmatched } = swapNames(CHUNK);
    expect(unmatched).toEqual([]);
    expect(body).toContain(CHAPTER_TITLES[4]);
    expect(body).toContain(ARABIC_NAMES['White Rabbit']);
    expect(body).not.toContain('White Rabbit');
  });

  it('reports a name the chunk does not hold', () => {
    const { unmatched } = swapNames(CHUNK.replace('Cheshire Cat', 'Cheshire Cat renamed away').replace('Cheshire Cat renamed away', ''));
    expect(unmatched).toEqual(['Cheshire Cat']);
  });

  it('reports a chapter title the minifier printed another way', () => {
    const { unmatched } = swapNames(CHUNK.replace('title:`Chapter 4`', 'title:"Chapter 4"'));
    expect(unmatched).toEqual(['title:`Chapter 4`']);
  });
});
