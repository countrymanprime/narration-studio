import { describe, expect, it } from 'vitest';
import { searchManuscript, snippetAround } from './searchManuscript';

const paragraphs = [
  { id: 'p1', chapterId: 'c1', text: 'The Queen said nothing. The queen never did.' },
  { id: 'p2', chapterId: 'c2', text: 'Nobody here.' },
  { id: 'p3', chapterId: 'c2', text: 'QUEEN' },
];

describe('searchManuscript', () => {
  it('finds every match, ignoring case, in paragraph order', () => {
    const found = searchManuscript(paragraphs, 'queen');
    expect(found.map((m) => [m.paragraphId, m.chapterId, m.start, m.end])).toEqual([
      ['p1', 'c1', 4, 9],
      ['p1', 'c1', 28, 33],
      ['p3', 'c2', 0, 5],
    ]);
  });

  it('searches nothing under two characters, trimmed', () => {
    expect(searchManuscript(paragraphs, '')).toEqual([]);
    expect(searchManuscript(paragraphs, 'q')).toEqual([]);
    expect(searchManuscript(paragraphs, ' q ')).toEqual([]);
    expect(searchManuscript(paragraphs, 'qu')).toHaveLength(3);
  });

  it('does not overlap matches of a repeating term', () => {
    expect(searchManuscript([{ id: 'p', chapterId: 'c', text: 'aaaa' }], 'aa')).toHaveLength(2);
  });

  it('finds nothing in no paragraphs or for an absent term', () => {
    expect(searchManuscript([], 'queen')).toEqual([]);
    expect(searchManuscript(paragraphs, 'zzzz')).toEqual([]);
  });

  it('marks the match inside its snippet', () => {
    const [first] = searchManuscript(paragraphs, 'queen');
    expect(first?.snippet).toEqual({ pre: 'The ', hit: 'Queen', post: ' said nothing. The queen never did.' });
  });
});

describe('snippetAround', () => {
  it('ellipsises a cut start and end', () => {
    const text = `${'a'.repeat(50)}HIT${'b'.repeat(60)}`;
    const snippet = snippetAround(text, 50, 53);
    expect(snippet.pre).toBe(`…${'a'.repeat(30)}`);
    expect(snippet.hit).toBe('HIT');
    expect(snippet.post).toBe(`${'b'.repeat(40)}…`);
  });
});
