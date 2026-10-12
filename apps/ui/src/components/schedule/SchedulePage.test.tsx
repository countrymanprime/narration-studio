// @vitest-environment jsdom
// The Schedule page body end to end against the mock host: the verdict, the table, the dialog, and every change as one journal entry.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { ProductionMilestone, ProductionOverview } from '../../api/contracts/production';
import { createMockApi } from '../../api/mockApi';
import type { ProductionSeed } from '../../api/productionMock';
import { OverlayHost } from '../../overlay/OverlayHost';
import { overlay } from '../../overlay/overlayService';
import { createJournal, type Journal } from '../../studio/journal/createJournal';
import type { NarrationApi } from '../../types';
import { WPH } from './estimates';
import { SchedulePage } from './SchedulePage';

const TODAY = new Date(2026, 9, 1);
const REC: ProductionMilestone = { name: 'All chapters recorded', dueDate: '2026-10-06', measure: 'rec' };
const CUSTOM_DONE: ProductionMilestone = { name: 'Contract signed', dueDate: '2026-09-20', done: true };
const CUSTOM: ProductionMilestone = { name: 'Retail sample', dueDate: '2026-10-12', note: 'Proofer wants the sample first' };

const overview = (statuses: ChapterStatus[]): ProductionOverview => ({
  chapters: statuses.map((status, i) => ({
    id: `c${i + 1}`,
    title: `Chapter ${i + 1}`,
    contentKind: 'narration',
    status,
    wordCount: WPH,
    recordedSeconds: null,
    hoursLogged: 0,
    pfh: null,
    readiness: null,
  })),
  totals: {
    chapters: statuses.length,
    finalizedChapters: 0,
    wordCount: statuses.length * WPH,
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

let journal: Journal;
let api: NarrationApi;
beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
});
afterEach(() => {
  cleanup();
  // Layers the overlay singleton still holds belong to the test that opened them.
  act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
});

type Setup = { seed?: ProductionSeed; statuses?: ChapterStatus[]; profile?: string };

async function mount({ seed = {}, statuses = ['not_started', 'not_started'], profile = 'acx@2026-09' }: Setup = {}) {
  api = createMockApi(
    {
      productionOverview: async () => overview(statuses),
      deliveryProfiles: async () => ({ profiles: [], globalDefault: { id: 'acx' }, hasProject: true, projectChoice: null, projectProfile: profile }),
    },
    { production: { deadline: '2026-10-31', contractedAmount: 250, payment: 'per_finished_hour', milestones: [REC, CUSTOM_DONE, CUSTOM], ...seed } },
  );
  render(
    <ApiProvider api={api}>
      <SchedulePage journal={journal} today={TODAY} />
      <OverlayHost />
    </ApiProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Schedule' }).catch(() => undefined);
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const names = () => [...document.querySelectorAll('[data-name]')].map((n) => n.textContent);
const dialog = () => screen.getByRole('dialog');
const entries = async () => (await journal.entries()).map((e) => e.label);
const stored = async () => (await api.productionPlan()).milestones;

describe('the verdict for each deadline', () => {
  const verdict = async (seed: Setup['seed'], statuses?: ChapterStatus[]) => {
    await mount({ seed, statuses });
    return (await screen.findByText(/·/, { selector: 'span' })).closest('span')!.textContent ?? '';
  };

  it('reads On track when the due date is far and the work fits', async () => {
    expect(await verdict({ deadline: '2026-12-01' })).toMatch(/^✓.*On track/);
  });

  it('reads a warning within a week, in words and a mark', async () => {
    // One finished hour of work is about 4 days; due in 5 days has less than 3 days of slack.
    expect(await verdict({ deadline: '2026-10-06' }, ['not_started'])).toMatch(/^!.*Tight/);
  });

  it('reads danger once the date has passed or the work cannot fit', async () => {
    expect(await verdict({ deadline: '2026-09-28' })).toMatch(/^✕.*Behind/);
  });

  it('reads Finished when every chapter is delivered, whatever the date', async () => {
    expect(await verdict({ deadline: '2026-09-28' }, ['finalized', 'finalized'])).toMatch(/Finished/);
  });

  it('says there is no due date when none is set', async () => {
    await mount({ seed: { deadline: null } });
    expect(await screen.findByText('No due date set', { selector: 'span' })).toBeTruthy();
  });
});

describe('with no chapters', () => {
  it('asks for a manuscript first and draws no table', async () => {
    await mount({ statuses: [] });
    expect(await screen.findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('the milestones table', () => {
  it('estimates a measured milestone, says "Not estimated" for a custom one and "Done" for a done one', async () => {
    await mount();
    expect(await within(rowOf('Contract signed')).findByRole('img', { name: 'Done' })).toBeTruthy();
    expect(within(rowOf('Retail sample')).getByRole('img', { name: 'Not estimated' })).toBeTruthy();
    expect(within(rowOf('All chapters recorded')).getByRole('img', { name: /^(Late by|At risk|On track) .*\(est\. [A-Z][a-z]{2} \d+\)$/ })).toBeTruthy();
  });

  it('shows a late milestone as late, with the days', async () => {
    await mount({ seed: { milestones: [{ ...REC, dueDate: '2026-10-01' }] } });
    expect(await within(rowOf('All chapters recorded')).findByRole('img', { name: /^Late by \d+ d/ })).toBeTruthy();
  });

  it('is read-only: no input in a milestone row, and the measure reads as its value', async () => {
    await mount({
      seed: {
        milestones: [
          { name: 'Sample', dueDate: '2026-10-05', measure: 'min20' },
          { name: 'Early', dueDate: '2026-10-06', measure: 'ch4' },
          { name: 'Checkpoint', dueDate: '2026-10-07', measure: 'checkpoint' },
          { name: 'Whole', dueDate: '2026-10-08', measure: 'all' },
          { name: 'Plain', dueDate: '2026-10-09' },
        ],
      },
    });
    await screen.findByText('Sample');
    for (const name of ['Sample', 'Early', 'Checkpoint', 'Whole', 'Plain']) expect(rowOf(name).querySelector('input, textarea, select')).toBeNull();
    const measure = (name: string) => rowOf(name).querySelector('[data-measure]')?.textContent;
    expect(measure('Sample')).toBe('First 20 finished minutes');
    expect(measure('Early')).toBe('First 4 chapters edited and proofed');
    expect(measure('Checkpoint')).toBe('First 15 finished minutes');
    expect(measure('Whole')).toBe('Whole book');
    expect(measure('Plain')).toBe('Custom');
  });

  it('sorts the rows by date', async () => {
    await mount({ seed: { milestones: [CUSTOM, { name: 'Earliest', dueDate: '2026-01-01' }, REC] } });
    await screen.findByText('Earliest');
    expect(names()).toEqual(['Earliest', 'All chapters recorded', 'Retail sample']);
  });

  it('marks a milestone done with a toggle that carries its state, one journal entry each way', async () => {
    await mount();
    const toggle = await screen.findByRole('button', { name: 'Mark All chapters recorded complete' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('true'));
    expect(within(rowOf('All chapters recorded')).getByRole('img', { name: 'Done' })).toBeTruthy();
    expect((await stored()).find((m) => m.name === 'All chapters recorded')?.done).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }).getAttribute('aria-pressed')).toBe('false'));
    expect(await entries()).toHaveLength(2);
  });

  it("shows the note as the note button's tooltip, or offers to add one", async () => {
    await mount();
    await screen.findByText('Retail sample');
    expect(rowOf('Retail sample').querySelector('[data-note]')?.getAttribute('aria-label')).toBe('Edit the note on Retail sample');
    expect(rowOf('All chapters recorded').querySelector('[data-note]')?.getAttribute('aria-label')).toBe('Add a note to All chapters recorded');
  });
});

describe('the milestone dialog', () => {
  const open = async (name: string) => {
    await screen.findByText(name);
    fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Edit ${name}` }));
    return within(dialog());
  };

  it('edits every detail: name (empty refused), date, measure with its N, note and done, as one journal entry', async () => {
    await mount();
    const d = await open('All chapters recorded');
    expect((d.getByLabelText('Name') as HTMLInputElement).value).toBe('All chapters recorded');
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '  ' } });
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    expect((await d.findByRole('alert')).textContent).toContain('Give the milestone a name and a date.');
    expect((await stored())[0].name).toBe('All chapters recorded');
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Everything recorded' } });
    fireEvent.change(d.getByLabelText('Due'), { target: { value: '2026-10-09' } });
    expect(d.queryByLabelText('How many chapters')).toBeNull();
    await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), 'chN');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '2' } });
    fireEvent.change(d.getByLabelText('Note'), { target: { value: 'Proofer wants the sample first' } });
    await userEvent.click(d.getByRole('checkbox', { name: 'Done' }));
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).find((m) => m.name === 'Everything recorded')).toEqual({
      name: 'Everything recorded',
      dueDate: '2026-10-09',
      measure: 'ch2',
      note: 'Proofer wants the sample first',
      done: true,
    });
    expect(await entries()).toEqual(['Edit milestone']);
  });

  it('clamps the chapter count to the book, and Cancel changes nothing', async () => {
    await mount();
    let d = await open('All chapters recorded');
    await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), 'chN');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '99' } });
    fireEvent.blur(d.getByLabelText('How many chapters'));
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('2');
    fireEvent.click(d.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored())[0].measure).toBe('ch2');
    fireEvent.click(within(rowOf('All chapters recorded')).getByRole('button', { name: 'Edit All chapters recorded' }));
    d = within(dialog());
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Nope' } });
    fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await stored())[0].name).toBe('All chapters recorded');
    expect(await entries()).toHaveLength(1);
  });

  it('adds a milestone from the dialog as one entry, with an Undo', async () => {
    await mount();
    await screen.findByText('Retail sample');
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add milestone' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('Give the milestone a name and a date.');
    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: 'Second sample' } });
    fireEvent.change(within(dialog()).getByLabelText('Due'), { target: { value: '2026-10-02' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).at(-1)).toEqual({ name: 'Second sample', dueDate: '2026-10-02' });
    expect(await entries()).toEqual(['Add milestone']);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await stored()).map((m) => m.name)).not.toContain('Second sample'));
  });

  it('removes a milestone as one entry and Undo puts it back', async () => {
    await mount();
    await screen.findByText('Retail sample');
    fireEvent.click(within(rowOf('Retail sample')).getByRole('button', { name: 'Remove Retail sample' }));
    await waitFor(async () => expect((await stored()).map((m) => m.name)).not.toContain('Retail sample'));
    expect(await entries()).toEqual(['Remove Retail sample']);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await stored()).map((m) => m.name)).toContain('Retail sample'));
    await screen.findByText('Retail sample');
  });

  it('opens at the note from the note button', async () => {
    await mount();
    await screen.findByText('Retail sample');
    fireEvent.click(rowOf('Retail sample').querySelector('[data-note]')!);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByLabelText('Note')));
  });

  it('always offers the measure the milestone already has, even when the profile does not', async () => {
    await mount({ profile: 'none@r1', seed: { milestones: [{ name: 'Checkpoint', dueDate: '2026-10-05', measure: 'checkpoint' }] } });
    const d = await open('Checkpoint');
    expect((d.getByRole('combobox', { name: 'What the milestone measures' }) as HTMLInputElement).value).toBe('checkpoint');
  });

  it('offers the 15-minute checkpoint only where the profile unlocks it, and no "from template" choice', async () => {
    await mount();
    await screen.findByText('Retail sample');
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    const options = () =>
      within(within(dialog()).getByRole('combobox', { name: 'What the milestone measures' }))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(options()).toContain('15-minute checkpoint');
    expect(within(dialog()).queryByText(/template/i)).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    cleanup();
    await mount({ profile: 'none@r1' });
    await screen.findByText('Retail sample');
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    expect(options()).not.toContain('15-minute checkpoint');
  });
});

describe('the due date', () => {
  it('changes with the date field, as one journal entry, and the header reads the new date', async () => {
    await mount();
    const field = await screen.findByRole('textbox', { name: 'Delivery due' });
    fireEvent.change(field, { target: { value: '2026-11-01' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/^Due Nov 1/)).toBeTruthy());
    expect((await api.productionPlan()).deadline).toBe('2026-11-01');
    expect(await entries()).toEqual(['Change the due date']);
  });

  it('refuses a date that is not written YYYY-MM-DD and changes nothing', async () => {
    await mount();
    const field = await screen.findByRole('textbox', { name: 'Delivery due' });
    fireEvent.change(field, { target: { value: 'next week' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Write the due date as YYYY-MM-DD.')).toBeTruthy();
    expect((await api.productionPlan()).deadline).toBe('2026-10-31');
    expect(await entries()).toEqual([]);
  });
});

describe('the contract', () => {
  it('shows the value of a rate per finished hour, and none under a royalty share', async () => {
    await mount({ statuses: ['not_started', 'not_started'] });
    expect(await screen.findByText('500')).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'How you are paid' }), 'royalty_share');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rate per finished hour' })).toBeNull());
    expect(screen.queryByText('Value at this rate')).toBeNull();
    expect((await api.productionPlan()).payment).toBe('royalty_share');
    expect((await api.productionPlan()).contractedAmount).toBeNull();
  });

  it('choosing ACX gives an unset contract per finished hour and keeps a payment the narrator set', async () => {
    await mount({ seed: { contractedAmount: undefined, payment: undefined } });
    expect((await api.productionPlan()).payment).toBe('none');
    await api.deliverySelectProfile('project', 'acx', '2026-09');
    expect((await api.productionPlan()).payment).toBe('per_finished_hour');
    await api.setProductionPayment('royalty_share');
    await api.deliverySelectProfile('project', 'acx', '2026-09');
    expect((await api.productionPlan()).payment).toBe('royalty_share');
    await api.setProductionPayment('none');
    await api.deliverySelectProfile('project', 'acx', '2026-09');
    expect((await api.productionPlan()).payment).toBe('none');
  });

  it('puts the amount back when the change of payment is undone', async () => {
    await mount();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'How you are paid' }), 'none');
    await waitFor(async () => expect((await api.productionPlan()).contractedAmount).toBeNull());
    await journal.undoLast();
    expect(await api.productionPlan()).toMatchObject({ payment: 'per_finished_hour', contractedAmount: 250 });
  });

  it('keeps the amount a narrator types, as a refusal from the host reads', async () => {
    await mount();
    const amount = await screen.findByRole('textbox', { name: 'Rate per finished hour' });
    fireEvent.change(amount, { target: { value: '300' } });
    fireEvent.blur(amount);
    await waitFor(async () => expect((await api.productionPlan()).contractedAmount).toBe(300));
    expect(await entries()).toEqual(['Change the contracted amount']);
  });
});
