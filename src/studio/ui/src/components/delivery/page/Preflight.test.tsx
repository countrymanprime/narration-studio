// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChapterState } from './chapterStates';
import { Preflight } from './Preflight';

afterEach(cleanup);

const states = (count: number): ChapterState[] =>
  Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, name: `Chapter ${i + 1}`, kind: 'ok', text: 'Pass' }));

const mount = (count: number) => render(<Preflight states={states(count)} known onCheckAgain={() => {}} onOpen={() => {}} />);

// Rule 6 of frontend-primitives (#2639): a list of rows is capped and scrolls inside its card; only the Production pipeline is exempt.
describe('the "Before you build" list is capped (rule 6, #2639)', () => {
  it('scrolls a 15-chapter list inside the card, a tab stop the keyboard can scroll, with the edge cue', () => {
    mount(15);
    const list = screen.getByRole('list', { name: 'Chapters' });
    expect(list.className).toMatch(/max-h-\[\d+rem\]/);
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('scroll-y-edges');
    expect(list.tabIndex).toBe(0);
  });

  it('keeps the cap at 24 rem or under, about a dozen rows, and the passing summary outside the scrolling box', () => {
    mount(15);
    const list = screen.getByRole('list', { name: 'Chapters' });
    const cap = Number(/max-h-\[(\d+)rem\]/.exec(list.className)?.[1]);
    expect(cap).toBeLessThanOrEqual(24);
    expect(list.contains(screen.getByText('Chapters passing'))).toBe(false);
  });

  it('does not make a short list a scroll box or a tab stop', () => {
    mount(4);
    const list = screen.getByRole('list', { name: 'Chapters' });
    expect(list.className).not.toContain('overflow-y-auto');
    expect(list.getAttribute('tabindex')).toBeNull();
  });
});
