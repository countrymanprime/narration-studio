// @vitest-environment jsdom
// Milestone changes made in a hurry or against a host that is slow or silent (state matrix, "Milestones" and "Talking to the host").
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionMilestone } from '../../api/contracts/production';
import { REC, CUSTOM, installKit, kit, mountSchedule, stored, toasts } from './scheduleKit.test';
import { WRITE_WAIT_MS } from './SchedulePage';

installKit();

const toggle = () => screen.findByRole('button', { name: 'Mark All chapters recorded complete' });

describe('pressing a row twice', () => {
  it('writes once when the done toggle is pressed twice before the host answers', async () => {
    const saves = vi.fn();
    await mountSchedule({ wrap: (base) => ({ saveProductionMilestones: async (m) => (saves(m), base.saveProductionMilestones(m)) }) });
    const button = await toggle();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(async () => expect((await stored()).milestones[0].done).toBe(true));
    expect(saves).toHaveBeenCalledTimes(1);
  });

  it('toggles back when it is pressed again after the host answered', async () => {
    await mountSchedule();
    fireEvent.click(await toggle());
    await waitFor(async () => expect((await stored()).milestones[0].done).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }));
    await waitFor(async () => expect((await stored()).milestones[0].done).toBeUndefined());
  });

  it('removes once when Remove is pressed twice, and Undo puts the row back', async () => {
    const saves = vi.fn();
    await mountSchedule({ wrap: (base) => ({ saveProductionMilestones: async (m) => (saves(m), base.saveProductionMilestones(m)) }) });
    const remove = await screen.findByRole('button', { name: 'Remove All chapters recorded' });
    fireEvent.click(remove);
    fireEvent.click(remove);
    await waitFor(async () => expect((await stored()).milestones.map((m) => m.name)).toEqual(['Retail sample']));
    expect(saves).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await stored()).milestones.map((m) => m.name)).toEqual(['All chapters recorded', 'Retail sample']));
  });

  it('keeps two different rows pressed together in order, neither lost', async () => {
    await mountSchedule();
    fireEvent.click(await toggle());
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Retail sample complete' }));
    await waitFor(async () => expect((await stored()).milestones.map((m) => Boolean(m.done))).toEqual([true, true]));
  });
});

describe('a host that is slow or silent', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('keeps the dialog busy while the host is silent, and Cancel still leaves the table as it was', async () => {
    await mountSchedule({ wrap: () => ({ saveProductionMilestones: () => new Promise<never>(() => undefined) }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit All chapters recorded' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' }).getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('All chapters recorded')).toBeTruthy();
    expect(screen.queryByText('Renamed')).toBeNull();
  });

  it('lets a later write go ahead after waiting for a silent one', async () => {
    let first = true;
    await mountSchedule({
      wrap: (base) => ({
        saveProductionMilestones: (m: ProductionMilestone[]) => {
          if (first) {
            first = false;
            return new Promise<never>(() => undefined);
          }
          return base.saveProductionMilestones(m);
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Retail sample' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark All chapters recorded complete' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS + 100)));
    await waitFor(async () => expect((await stored()).milestones[0].done).toBe(true));
  });

  it('shows an answer that comes late, and a refusal that comes late, as they are', async () => {
    await mountSchedule({
      wrap: (base) => ({
        saveProductionMilestones: async (m) => {
          await new Promise((resolve) => window.setTimeout(resolve, 8_000));
          if (m.length === 0) throw new Error('a book needs a milestone');
          return base.saveProductionMilestones(m);
        },
      }),
    });
    fireEvent.click(await toggle());
    await act(async () => void (await vi.advanceTimersByTimeAsync(8_100)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('true'));
    expect(toasts()).toEqual([]);
  });
});

describe('the host refusing a save', () => {
  it("shows the host's sentence in the dialog and a toast, and changes nothing", async () => {
    await mountSchedule({
      wrap: () => ({
        saveProductionMilestones: async () => {
          throw new Error('milestone 1 (Renamed): the name is longer than 200 characters');
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit All chapters recorded' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/longer than 200/));
    expect(toasts().join(' ')).toMatch(/longer than 200/);
    expect((await stored()).milestones[0]).toEqual(REC);
    expect((await stored()).milestones[1]).toEqual(CUSTOM);
    void kit;
  });

  it('says the schedule could not be read, and changes nothing, when the host cannot be read before a change', async () => {
    let reads = 0;
    await mountSchedule({
      wrap: (base) => ({
        productionPlan: async () => {
          reads += 1;
          if (reads > 1) throw new Error('the project closed');
          return base.productionPlan();
        },
      }),
    });
    fireEvent.click(await toggle());
    await waitFor(() => expect(toasts().join(' ')).toMatch(/could not be read before the change, so nothing was changed: the project closed/));
  });
});
