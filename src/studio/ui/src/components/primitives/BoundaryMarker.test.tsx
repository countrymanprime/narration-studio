// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoundaryMarker } from './BoundaryMarker';

afterEach(cleanup);

describe('BoundaryMarker', () => {
  it('draws a chapter end and a page break with the same classes', () => {
    render(
      <>
        <BoundaryMarker variant="chapterEnd">End of Chapter 1 · 3,182 words</BoundaryMarker>
        <BoundaryMarker variant="page">Page 12</BoundaryMarker>
      </>,
    );
    const end = screen.getByText('End of Chapter 1 · 3,182 words').parentElement;
    const page = screen.getByText('Page 12').parentElement;
    expect(end?.className).toBe(page?.className);
    expect(end?.getAttribute('data-boundary')).toBe('chapterEnd');
    expect(page?.getAttribute('data-boundary')).toBe('page');
  });

  it('passes data attributes and a position class through', () => {
    render(
      <BoundaryMarker variant="page" data-page-break="2" className="absolute">
        Page 2
      </BoundaryMarker>,
    );
    const marker = screen.getByText('Page 2').parentElement;
    expect(marker?.getAttribute('data-page-break')).toBe('2');
    expect(marker?.className).toContain('absolute');
  });
});
