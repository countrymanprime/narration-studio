// @vitest-environment jsdom
import { faMicrochip } from '@fortawesome/free-solid-svg-icons';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityPanel } from './ActivityPanel';

const figure = { key: 'workers', icon: faMicrochip, label: 'Workers', value: '2 of 4 busy', hint: 'Automatic runs 4 at once.' };

describe('ActivityPanel', () => {
  it('names each figure with its value and hint, and the phase, detail and time', () => {
    render(<ActivityPanel label="Job activity" percent={12.4} running phase="First pass" detail="small" time="0:05" figures={[figure]} />);
    expect(screen.getByRole('region', { name: 'Job activity' })).toBeTruthy();
    expect(screen.getByLabelText('Workers: 2 of 4 busy. Automatic runs 4 at once.')).toBeTruthy();
    expect(screen.getByText('First pass')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByLabelText('Time so far 0:05')).toBeTruthy();
  });

  it('keeps one size with no figures, no detail and no time', () => {
    const { container } = render(<ActivityPanel label="Job activity" percent={0} running={false} phase="Starting" figures={[]} />);
    expect(container.firstElementChild?.className).toContain('h-[8.75rem]');
  });
});
