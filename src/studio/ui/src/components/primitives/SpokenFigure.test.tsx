// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpokenFigure } from './SpokenFigure';
import { StatTile } from './StatTile';

// The hidden copy is `position: absolute`: with no positioned ancestor it sits where the page's own box is and widens the page's scroll width (the atlas found it,
// #3443). Its root, and a tile's value row (which holds the hidden space), are positioned, so the hidden text is contained.
describe('SpokenFigure', () => {
  it('is a positioned root around the visible figure and its hidden spoken copy, neither of which can be copied with it', () => {
    const { container } = render(<SpokenFigure text="4h 35m" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('relative');
    expect(screen.getByText('4h 35m').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('4 hours 35 minutes').className).toContain('select-none');
  });
  it('draws plain text as it is, with no hidden copy', () => {
    const { container } = render(<SpokenFigure text="Not measured yet" />);
    expect(container.querySelector('.sr-only')).toBeNull();
  });
  it("a tile's value row is positioned and its hidden space cannot be copied", () => {
    const { container } = render(<StatTile label="Recording" value="4h 35m" unit="left" />);
    const row = [...container.querySelectorAll<HTMLElement>('div')].find((el) => el.className.includes('row-start-2'))!;
    expect(row.className).toContain('relative');
    for (const hidden of container.querySelectorAll('.sr-only')) expect(hidden.className, hidden.textContent ?? '').toContain('select-none');
  });
});
