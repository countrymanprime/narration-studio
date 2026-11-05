// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityPanel } from './ActivityPanel';

const figure = { key: 'workers', icon: 'transcriptionsAtOnce' as const, label: 'Workers', value: '2 of 4 busy', hint: 'Automatic runs 4 at once.' };

describe('ActivityPanel', () => {
  it('names each figure with its value and hint, and the phase, detail and time', () => {
    render(<ActivityPanel label="Job activity" percent={12.4} running phase="First pass" detail="small" time="0:05" figures={[figure]} />);
    expect(screen.getByRole('region', { name: 'Job activity' })).toBeTruthy();
    expect(screen.getByLabelText('Workers: 2 of 4 busy. Automatic runs 4 at once.')).toBeTruthy();
    expect(screen.getByText('First pass')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByLabelText('Time so far 0:05')).toBeTruthy();
  });

  it('draws each figure as a StatTile: the label as the tile eyebrow, the value in the tile mono style', () => {
    render(<ActivityPanel label="Job activity" percent={12} running phase="First pass" figures={[figure]} />);
    const list = screen.getByRole('list', { name: 'Figures' });
    expect(within(list).getByText('Workers').parentElement?.className).toContain('Barlow_Condensed');
    expect(within(list).getByText('2 of 4 busy').parentElement?.className).toContain('IBM_Plex_Mono');
    expect(within(list).getByText('2 of 4 busy').parentElement?.className, 'compact value fits the fixed-height box').toContain('--font-size-base');
    expect(list.querySelectorAll('svg').length).toBe(1);
  });

  it('keeps the hint as the figure tooltip, never as text in the flow', () => {
    render(<ActivityPanel label="Job activity" percent={12} running phase="First pass" figures={[figure]} />);
    expect(screen.queryByText('Automatic runs 4 at once.')).toBeNull();
  });

  it('keeps one size with no figures, no detail and no time', () => {
    const { container } = render(<ActivityPanel label="Job activity" percent={0} running={false} phase="Starting" figures={[]} />);
    expect(container.firstElementChild?.className).toContain('h-[8.75rem]');
  });
});
