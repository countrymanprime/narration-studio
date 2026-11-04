// @vitest-environment jsdom
// The chart with and without a due date (alignment audit XSH-16, XSH-18).
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressChart } from './ProgressChart';
import { MID_BOOK, NO_TAKE_LOG, STORY_TODAY, overviewFor } from './overviewFixtures';

afterEach(cleanup);

const draw = (due: Date | null, noteBelow = false, log?: typeof NO_TAKE_LOG) => {
  const o = overviewFor(MID_BOOK, undefined, log);
  return render(
    <ProgressChart k={o.k} wph={9300} start={o.start} today={STORY_TODAY} due={due} recordedHours={o.recordedHours} series={o.series} noteBelow={noteBelow} />,
  );
};

describe('ProgressChart', () => {
  it('says in a "?" what draws the plan line when there is no due date, and draws no caption for it', async () => {
    const { container } = draw(null);
    expect(container.querySelector('[data-line="plan"]')).toBeNull();
    expect(container.querySelector('[data-chart-note]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'About the plan line' }));
    expect(await screen.findByText('Set a due date to see the plan line.')).toBeTruthy();
  });

  it('draws no caption with a due date and a take log', () => {
    const { container } = draw(overviewFor(MID_BOOK).kpi.due);
    expect(container.querySelector('[data-chart-note]')).toBeNull();
  });

  it('keeps the unmeasured-days caption under the plot with no due date, and the plan line sentence in the "?"', () => {
    draw(null, true, NO_TAKE_LOG);
    expect(screen.getByText('Recorded days not measured yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About the plan line' })).toBeTruthy();
  });

  it('starts the plot just under the card body padding, with the axis labels close to the left edge', () => {
    const { container } = draw(overviewFor(MID_BOOK).kpi.due);
    const due = container.querySelector('[data-line="due"]')!;
    expect(Number(due.getAttribute('y1'))).toBeLessThanOrEqual(6);
    const label = [...container.querySelectorAll('text')].find((t) => t.textContent === '0h')!;
    expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(22);
  });
});
