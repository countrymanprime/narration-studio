import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckActivityPanel } from './CheckActivityPanel';
import { summarizeActivity } from './activityView';

const view = summarizeActivity([
  {
    running: true,
    pass: 'pipeline',
    activity: {
      requested: 0,
      items: { total: 6, done: 2 },
      firstPass: { model: 'small', workers: 4, busy: 3, total: 112, done: 40, final: true },
      recheck: { model: 'large-v3-turbo', workers: 1, busy: 1, total: 7, done: 3, final: false, reasons: ['low_confidence'] },
    },
  },
]);

describe('CheckActivityPanel', () => {
  it('names each figure and its meaning for a screen reader, and draws the phase, models and time', () => {
    render(<CheckActivityPanel view={view} percent={42} startedAt={0} ticking={false} now={() => 161_000} />);
    expect(screen.getByRole('progressbar', { name: 'Overall progress' })).toBeInTheDocument();
    expect(screen.getByText('First pass and re-check')).toBeInTheDocument();
    expect(screen.getByText('small → large-v3-turbo')).toBeInTheDocument();
    expect(screen.getByText('2:41')).toBeInTheDocument();
    expect(screen.getByLabelText('Chunks: 40 of 112. Pieces of audio transcribed; a short recording is one piece.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Workers: 4 of 5 busy\. Automatic runs 4 at once/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Re-check: 3 of 7\+\. large-v3-turbo re-checks passages/)).toBeInTheDocument();
  });

  it('keeps its size when nothing has been reported', () => {
    const empty = summarizeActivity([{ running: true }]);
    const { container, rerender } = render(<CheckActivityPanel view={empty} percent={0} ticking />);
    const before = container.firstElementChild?.className;
    rerender(<CheckActivityPanel view={view} percent={50} startedAt={0} ticking={false} now={() => 1000} />);
    expect(container.firstElementChild?.className).toBe(before);
    expect(before).toContain('h-[8.75rem]');
  });
});
