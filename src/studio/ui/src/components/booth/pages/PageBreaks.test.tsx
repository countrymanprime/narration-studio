// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageBreaks } from './PageBreaks';

describe('PageBreaks', () => {
  afterEach(cleanup);

  it('draws a Page N label for each break, carrying its spot, inside a layer that takes no room', () => {
    const { container } = render(
      <div className="relative">
        <span data-unit="0">
          <span data-word="0">One</span> <span data-word="1">two</span>
        </span>
        <PageBreaks breaks={[{ page: 2, cur: 0, wcur: 1, paragraphId: 'p1', word: 1, offset: 4 }]} />
      </div>,
    );
    const label = screen.getByText('Page 2');
    expect(label.dataset).toMatchObject({ pageBreak: '2', paragraphId: 'p1', offset: '4' });
    expect(container.querySelector('[data-page-breaks]')?.className).toContain('h-0');
  });

  it('draws nothing for a chapter of one page', () => {
    const { container } = render(<PageBreaks breaks={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
