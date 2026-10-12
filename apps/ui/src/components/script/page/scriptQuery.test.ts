import { describe, expect, it } from 'vitest';
import { findQuery, readFindQuery } from './scriptQuery';

describe('the find address', () => {
  it('opens Find with the text', () => {
    expect(readFindQuery(new URLSearchParams('?find=Alice'))).toBe('Alice');
  });

  it('round-trips text with spaces, quotes and symbols', () => {
    for (const text of ['the white rabbit', "Queen's", 'a&b=c', 'Zoë #1']) {
      expect(readFindQuery(new URLSearchParams(findQuery(text)))).toBe(text);
    }
  });

  it('asks for nothing when find is absent or blank', () => {
    expect(readFindQuery(new URLSearchParams(''))).toBeNull();
    expect(readFindQuery(new URLSearchParams('?find='))).toBeNull();
    expect(readFindQuery(new URLSearchParams('?find=%20'))).toBeNull();
    expect(readFindQuery(new URLSearchParams('?chapter=c1'))).toBeNull();
  });
});
