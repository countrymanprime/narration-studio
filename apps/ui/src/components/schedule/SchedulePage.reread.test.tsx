// @vitest-environment jsdom
// The Schedule page keeping its reading fresh (state matrix, "Page read" and "Talking to the host"): the host pushes nothing for these, so the
// page asks again on focus, on a timer and at midnight, shows a failed re-read as old rather than as fact, and never lets an older answer
// replace a newer save.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionPlan } from '../../api/contracts/production';
import { REC, CUSTOM, installKit, kit, mountSchedule, stored, toasts } from './scheduleKit.test';
import { REREAD_EVERY_MS, REREAD_FOCUS_GAP_MS } from './useScheduleReading';

installKit();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const subtitle = () => document.querySelector('h1')?.parentElement?.textContent ?? '';
const counted = () => {
  const reads = { plan: 0 };
  return { reads, wrap: (base: typeof kit.api) => ({ productionPlan: async () => (reads.plan++, base.productionPlan()) }) };
};

describe('asking the host again', () => {
  it('reads again every minute and when the window is focused again, but a burst of focus events is one read', async () => {
    const { reads, wrap } = counted();
    await mountSchedule({ wrap, today: null });
    await screen.findByText(/Due Oct 31/);
    expect(reads.plan).toBe(1);
    await advance(REREAD_EVERY_MS + 100);
    expect(reads.plan).toBe(2);
    await advance(REREAD_FOCUS_GAP_MS + 100);
    fireEvent.focus(window);
    fireEvent.focus(window);
    fireEvent.focus(window);
    await advance(50);
    expect(reads.plan).toBe(3);
  });

  it('shows what another tool changed in the project on the next read', async () => {
    await mountSchedule({ today: null });
    await screen.findByText(/Due Oct 31/);
    await kit.api.setProductionDeadline('2026-11-20', 250);
    await advance(REREAD_EVERY_MS + 100);
    await screen.findByText(/Due Nov 20/);
  });
});

describe('a re-read that fails', () => {
  it('keeps the reading, says it is old and why, and Retry clears it once the host answers', async () => {
    let fail = false;
    await mountSchedule({
      today: null,
      wrap: (base) => ({
        productionPlan: async () => {
          if (fail) throw new Error('the project folder went away');
          return base.productionPlan();
        },
      }),
    });
    await screen.findByText(/Due Oct 31/);
    fail = true;
    await advance(3 * REREAD_EVERY_MS);
    const notice = await screen.findByText(/Couldn't read the schedule again: .*project folder went away.*This is what was read \d min ago/);
    expect(notice).toBeTruthy();
    expect(subtitle()).toMatch(/Due Oct 31/);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(/Couldn't read the schedule again/)).toBeNull());
  });

  it('is an error with Retry when the very first read fails, and recovers', async () => {
    let fail = true;
    await mountSchedule({
      today: null,
      wrap: (base) => ({
        productionPlan: async () => {
          if (fail) throw new Error('no project is open');
          return base.productionPlan();
        },
      }),
    });
    expect(await screen.findByText(/could not be read: no project is open/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(/Due Oct 31/);
  });
});

describe('answers that arrive in the wrong order', () => {
  it('never lets a read that began before a save replace what the save answered', async () => {
    let calls = 0;
    let release: (plan: ProductionPlan) => void = () => undefined;
    await mountSchedule({
      today: null,
      wrap: (base) => ({
        productionPlan: async () => {
          calls += 1;
          const before = await base.productionPlan();
          // The second read (the timer's) is held until the test lets it go, with the plan as it was when it began.
          return calls === 2 ? new Promise<ProductionPlan>((resolve) => (release = resolve)).then(() => before) : before;
        },
      }),
    });
    await screen.findByText(/Due Oct 31/);
    await advance(REREAD_EVERY_MS + 100);
    expect(calls).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('true'));
    await act(async () => release({ ...(await stored()), milestones: [REC, CUSTOM] }));
    await advance(50);
    expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('answers a late first read when it finally comes', async () => {
    await mountSchedule({
      today: null,
      wrap: (base) => ({
        productionPlan: async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 20_000));
          return base.productionPlan();
        },
      }),
    });
    expect(screen.getByText(/Loading the schedule/)).toBeTruthy();
    await advance(21_000);
    await screen.findByText(/Due Oct 31/);
  });
});

describe('an entry taken back from the history panel', () => {
  it('shows what the host holds after the undo, not the value the page last drew', async () => {
    await mountSchedule({ today: null });
    const due = (await screen.findByLabelText('Delivery due')) as HTMLInputElement;
    fireEvent.change(due, { target: { value: '2026-12-01' } });
    fireEvent.blur(due);
    await screen.findByText(/Due Dec 1/);
    const [entry] = await kit.journal.entries();
    await act(async () => void (await kit.journal.undo(entry.id)));
    await screen.findByText(/Due Oct 31/);
    expect(((await screen.findByLabelText('Delivery due')) as HTMLInputElement).value).toBe('2026-10-31');
  });
});

describe('a milestone dialog open while the list changes', () => {
  it('refuses saving an edit over a list that changed since it opened, and overwrites nothing', async () => {
    await mountSchedule({ today: null });
    await screen.findByText('All chapters recorded');
    fireEvent.click(screen.getByRole('button', { name: 'Edit All chapters recorded' }));
    const dialog = await screen.findByRole('dialog');
    // Someone else (another window, the host) adds a milestone while the dialog is open; the page re-reads it.
    await kit.api.saveProductionMilestones([REC, CUSTOM, { name: 'Added elsewhere', dueDate: '2026-10-20' }]);
    await advance(REREAD_EVERY_MS + 100);
    await screen.findByText('Added elsewhere');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/changed since/));
    expect((await stored()).milestones.map((m) => m.name)).toEqual(['All chapters recorded', 'Retail sample', 'Added elsewhere']);
  });

  it('still adds to a list that changed, since an add only appends', async () => {
    await mountSchedule({ today: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const dialog = await screen.findByRole('dialog');
    await kit.api.saveProductionMilestones([REC, CUSTOM, { name: 'Added elsewhere', dueDate: '2026-10-20' }]);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Mine' } });
    fireEvent.change(within(dialog).getByLabelText('Due'), { target: { value: '2026-10-25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    await waitFor(async () =>
      expect((await stored()).milestones.map((m) => m.name)).toEqual(['All chapters recorded', 'Retail sample', 'Added elsewhere', 'Mine']),
    );
  });

  it('refuses a done toggle on a row another writer changed, with a sentence', async () => {
    await mountSchedule({ today: null });
    await screen.findByText('All chapters recorded');
    await kit.api.saveProductionMilestones([{ ...REC, name: 'Another name' }, CUSTOM]);
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }));
    await waitFor(() => expect(toasts().join(' ')).toMatch(/changed since this was shown/));
    expect((await stored()).milestones[0]).toEqual({ ...REC, name: 'Another name' });
  });
});

describe('the clock moving while the page is open', () => {
  it('moves the day count on at midnight without a reload', async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 23, 59, 0));
    await mountSchedule({ today: null });
    await screen.findByText(/Due Oct 31 · 30 days left/);
    await advance(2 * REREAD_EVERY_MS);
    await screen.findByText(/Due Oct 31 · 29 days left/);
  });

  it('reads the real date again when the app is reopened after the deadline', async () => {
    await mountSchedule({ today: null, seed: { deadline: '2026-10-05' } });
    await screen.findByText(/Due Oct 5 · 4 days left/);
    cleanup();
    vi.setSystemTime(new Date(2026, 9, 9, 8, 0, 0));
    await mountSchedule({ today: null, seed: { deadline: '2026-10-05' } });
    await screen.findByText(/Due Oct 5 · 4 days overdue/);
  });
});
