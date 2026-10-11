// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { ProductionOverview, ProductionPlan, ProductionRateBasis } from '../../../api/contracts/production';
import { createMockApi } from '../../../api/mockApi';
import { createMockMeasurements } from '../../../ports/measurements';
import { PortOverrides } from '../../../ports/usePort';
import { TargetInfoButton } from './TargetInfoButton';

const WORDS = [2000, 2500, 4000, 2351];
const overview = (): ProductionOverview => ({
  chapters: WORDS.map((wordCount, i) => ({
    id: String(i + 1),
    title: `Chapter ${i + 1}`,
    contentKind: 'narration',
    status: 'recording',
    wordCount,
    recordedSeconds: null,
    hoursLogged: 0,
    pfh: null,
    readiness: null,
  })),
  totals: {
    chapters: 4,
    finalizedChapters: 0,
    wordCount: 10851,
    recordedSeconds: 0,
    measuredChapters: 0,
    hoursLogged: 0,
    hoursByStage: {},
    bookPfh: null,
    contractedAmount: null,
    effectiveRate: null,
  },
  deadline: null,
  running: null,
  nextUp: [],
});

function mount(opts: { measured?: boolean; basis?: ProductionRateBasis } = {}) {
  const set = vi.fn(async (basis: ProductionRateBasis): Promise<ProductionPlan> => ({
    deadline: null,
    contractedAmount: null,
    payment: 'none',
    rateBasis: basis,
    milestones: [],
  }));
  const api = createMockApi({
    productionPlan: async () => ({ deadline: null, contractedAmount: null, payment: 'none', rateBasis: opts.basis, milestones: [] }),
    productionOverview: async () => overview(),
    setProductionRateBasis: set,
  });
  const measurements = opts.measured === false ? createMockMeasurements({ none: true }) : createMockMeasurements();
  render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ measurements }}>
        <div className="relative" data-testid="kpi">
          <TargetInfoButton />
        </div>
      </PortOverrides>
    </ApiProvider>,
  );
  return { set };
}
const icon = () => screen.getByRole('button', { name: 'Finished-hour target' });
const popup = () => screen.findByRole('dialog', { name: 'Finished-hour target' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('popover-shows-both-rates-and-the-breakdown', () => {
  it('shows the standard and the measured rate, their targets and the breakdown', async () => {
    mount();
    await userEvent.click(icon());
    const pop = await popup();
    await waitFor(() => expect(within(pop).getByText('11,095')).toBeTruthy());
    expect(within(pop).getByText('9,300')).toBeTruthy();
    expect(pop.querySelector('[data-basis="standard"]')?.textContent).toContain('Target 1:10');
    expect(pop.querySelector('[data-basis="yours"]')?.textContent).toContain('Target 0:59');
    expect(pop.textContent).toContain('Ch 1, Ch 2 and Ch 4 have a measured length: 6,851 words in 37:03.');
    expect(within(pop).getByRole('button', { name: 'Standard' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a dash and the reason while nothing is measured, and offers no Your pace', async () => {
    mount({ measured: false });
    await userEvent.click(icon());
    const pop = await popup();
    await waitFor(() => expect(pop.textContent).toContain('Your rate is not measured yet. No chapter has a measured length yet.'));
    expect(pop.querySelector('[data-basis="yours"]')?.textContent).toContain('—');
    expect(within(pop).queryByRole('button', { name: 'Your pace' })).toBeNull();
  });
});

describe('basis-switch-writes-the-plan', () => {
  it('writes own for Your pace and standard for Standard', async () => {
    const { set } = mount({ basis: 'own' });
    await userEvent.click(icon());
    const pop = await popup();
    await waitFor(() => expect(within(pop).getByRole('button', { name: 'Your pace' }).getAttribute('aria-pressed')).toBe('true'));
    await userEvent.click(within(pop).getByRole('button', { name: 'Standard' }));
    expect(set).toHaveBeenLastCalledWith('standard');
    await userEvent.click(within(pop).getByRole('button', { name: 'Your pace' }));
    expect(set).toHaveBeenLastCalledWith('own');
  });
});

describe('icon-takes-no-layout-space-and-opens-three-ways', () => {
  it('sits on the corner out of the flow', () => {
    mount();
    expect(icon().className).toContain('absolute');
  });

  it('opens on hover and closes after the pointer leaves, but a click keeps it open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount();
    await user.hover(icon());
    await popup();
    await user.unhover(icon());
    await act(async () => void vi.advanceTimersByTime(400));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finished-hour target' })).toBeNull());

    await user.hover(icon());
    await popup();
    await user.click(icon());
    await user.unhover(icon());
    await act(async () => void vi.advanceTimersByTime(400));
    expect(screen.getByRole('dialog', { name: 'Finished-hour target' })).toBeTruthy();
  });

  it('opens on keyboard focus and Escape closes it and returns focus to the icon', async () => {
    mount();
    await userEvent.tab();
    await popup();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finished-hour target' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(icon()));
    expect(screen.queryByRole('dialog', { name: 'Finished-hour target' })).toBeNull();
  });
});
