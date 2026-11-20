import { describe, expect, it } from 'vitest';
import { pageNameFor } from './railPages';

describe('pageNameFor', () => {
  it('names the rail page a path is on', () => {
    expect(pageNameFor('/script')).toBe('Script');
    expect(pageNameFor('/editing/chapter-2?x=1')).toBe('Editing');
    expect(pageNameFor('/')).toBe('Production');
  });

  // #3555 item 3: a move by history steps knows no path; it must not be named as Production.
  it('names no page for the empty path of a move by history steps, or for a path no rail item owns', () => {
    expect(pageNameFor('')).toBeUndefined();
    expect(pageNameFor('/somewhere-else')).toBeUndefined();
  });
});
