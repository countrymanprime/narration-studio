import { describe, expect, it, vi } from 'vitest';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { evidenceLinks } from './evidenceLinks';

const CHAPTERS = [
  {
    id: 'c1',
    title: 'Chapter 1',
    paragraphIds: [
      { id: 'p-a', index: 0 },
      { id: 'p-b', index: 1 },
    ],
  },
  {
    id: 'c2',
    title: 'Chapter 2',
    paragraphIds: [
      { id: 'p-c', index: 2 },
      { id: 'p-d', index: 3 },
    ],
  },
] as ManuscriptChapter[];

describe('a quote goes to its Script line', () => {
  it('labels the quote with its chapter and line and goes to the paragraph by its book-wide index', () => {
    const goTo = vi.fn();
    const links = evidenceLinks(CHAPTERS, goTo);
    expect(links.lineLabel('p-d')).toBe('Chapter 2 · line 2');
    links.onGoToEvidence('p-d');
    expect(goTo).toHaveBeenCalledWith('c2', 3);
  });

  it('a paragraph no chapter lists goes nowhere', () => {
    const goTo = vi.fn();
    const links = evidenceLinks(CHAPTERS, goTo);
    expect(links.lineLabel('gone')).toBe('line not found');
    links.onGoToEvidence('gone');
    expect(goTo).not.toHaveBeenCalled();
  });
});
