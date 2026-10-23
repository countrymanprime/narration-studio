// @vitest-environment jsdom
// The Schedule's loading state (state matrix): the title and the page's blocks while the plan is read, then the page, the empty state or the
// error with Retry; a reload from the error starts from the skeleton again.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installKit, mountSchedule } from './scheduleKit.test';

installKit();

const never = () => new Promise<never>(() => {});
const region = () => screen.queryByRole('group', { name: 'Loading the Schedule' });

describe('Schedule loading state', () => {
  it('keeps the title and shows one busy region while the plan is read, however long that takes', async () => {
    await mountSchedule({ wrap: () => ({ productionPlan: never }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Schedule' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Loading the schedule…');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
    // (The overlay host keeps an empty alert region of its own; the page's error would have text.)
    expect(screen.queryAllByRole('alert').filter((node) => node.textContent)).toEqual([]);
  });

  it('is replaced by the page when the plan arrives', async () => {
    await mountSchedule();
    await screen.findByText(/Due Oct 31/);
    expect(region()).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Schedule' })).toHaveLength(1);
  });

  it('shows the error with Retry, not a skeleton, when the plan cannot be read, and the skeleton again while it reads', async () => {
    let calls = 0;
    await mountSchedule({
      wrap: (base) => ({
        productionPlan: () => (++calls === 1 ? Promise.reject(new Error('The plan could not be read.')) : base.productionPlan()),
      }),
    });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(region()).toBeNull();
    fireEvent.click(retry);
    await screen.findByText(/Due Oct 31/);
    await waitFor(() => expect(region()).toBeNull());
  });
});
