// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSelection } from './getSelection';
import { Paragraphs, RECT, selectIn } from './fixtures';

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

const rows = [
  { id: 'p1', chapterId: 'chapter-1', text: 'Alice was beginning to get very tired.' },
  { id: 'p2', chapterId: 'chapter-1', text: 'So she was considering.' },
];

describe('getSelection helpers', () => {
  it('reads nothing for a caret or no selection', () => {
    render(<Paragraphs rows={rows} />);
    expect(getSelection()).toBeNull();
    selectIn('p1', 3, 3);
    expect(getSelection()).toBeNull();
  });

  it('reads a selection in one paragraph as a place, trimmed of blanks, with the chapter and the rectangle', () => {
    render(<Paragraphs rows={rows} />);
    selectIn('p1', 5, 15);
    expect(getSelection()).toEqual({ chapterId: 'chapter-1', paragraphId: 'p1', start: 6, end: 15, quote: 'was begin', rect: RECT });
  });

  it('reports a selection across paragraphs as multi, with only its rectangle', () => {
    render(<Paragraphs rows={rows} />);
    selectIn('p1', 2, 4, 'p2');
    expect(getSelection()).toEqual({ multi: true, rect: RECT });
  });

  it('ignores text outside the reader and blanks only', () => {
    render(
      <>
        <span>outside text</span>
        <Paragraphs rows={[{ id: 'p1', chapterId: 'chapter-1', text: 'a   b' }]} />
      </>,
    );
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('span')!);
    window.getSelection()!.addRange(range);
    expect(getSelection()).toBeNull();
    selectIn('p1', 1, 4);
    expect(getSelection()).toBeNull();
  });
});
