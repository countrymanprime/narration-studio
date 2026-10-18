// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingRegion, Skeleton } from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  it('is hidden from assistive tech: the region around it speaks for it', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shimmers only under motion-ok, so reduced motion gets a still block', () => {
    const { container } = render(<Skeleton />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('motion-ok:animate-[skeleton-shimmer');
    expect(cls).not.toMatch(/(^|\s)animate-/);
  });

  it('takes its size from className and its tall variant', () => {
    const { container } = render(<Skeleton tall className="w-1/2" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('h-16');
    expect(cls).toContain('w-1/2');
  });
});

describe('LoadingRegion', () => {
  it('is one busy group with a name and one polite status, whatever it holds', () => {
    render(
      <LoadingRegion label="Loading the Booth" status="Reading the chapters…">
        <Skeleton />
        <Skeleton />
      </LoadingRegion>,
    );
    const region = screen.getByRole('group', { name: 'Loading the Booth' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Reading the chapters…');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
