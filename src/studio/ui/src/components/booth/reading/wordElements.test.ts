// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { wordElements } from './wordElements';

function column(units: number, words: number): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = Array.from(
    { length: units },
    (_, u) => `<span data-unit="${u}">${Array.from({ length: words }, (_, w) => `<span data-word="${w}">w${u}.${w}</span>`).join(' ')}</span>`,
  ).join('');
  return root;
}

describe('wordElements', () => {
  it('finds each word by its sentence and word number, and null for one that is not drawn', () => {
    const found = wordElements(column(5, 3), [
      { cur: 4, wcur: 2 },
      { cur: 0, wcur: 0 },
      { cur: 9, wcur: 0 },
      { cur: 1, wcur: 7 },
    ]);
    expect(found.map((el) => el?.textContent ?? null)).toEqual(['w4.2', 'w0.0', null, null]);
  });

  it('walks the chapter once for any number of words, not once per word', () => {
    const root = column(200, 4);
    const search = vi.spyOn(root, 'querySelector');
    const searchAll = vi.spyOn(root, 'querySelectorAll');
    wordElements(
      root,
      Array.from({ length: 100 }, (_, i) => ({ cur: i, wcur: 1 })),
    );
    expect(search).not.toHaveBeenCalled();
    expect(searchAll).toHaveBeenCalledTimes(1);
  });
});
