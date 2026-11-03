// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { ExportRequest, NarrationApi } from '../../types';
import { clearToasts, findToast, toastTexts } from '../../fixtures/toasts';
import { MasteringChain, useMasteringProviders } from './MasteringChain';
import { MasterToSpecPanel } from './MasterToSpecPanel';
import { MASTER_REQUEST_WAIT_MS } from './masterRequests';
import { EXPORT_PLAN_NO_ANSWER, EXPORT_START_NO_ANSWER, useExportJobs } from './useExportJobs';

beforeEach(clearToasts);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Master & QC's two halves that meet here: the export jobs and the mastering rows, as MasterPage wires them.
function Harness() {
  const jobs = useExportJobs();
  const mastering = useMasteringProviders();
  const chain = mastering.providers?.providers.find((row) => row.name === mastering.providers?.effective);
  return (
    <>
      <button type="button" onClick={() => void jobs.pick()}>
        Pick
      </button>
      <MasterToSpecPanel jobs={jobs} chain={chain} onStartRefused={mastering.reload} />
      <MasteringChain providers={mastering.providers} problem={mastering.problem} />
    </>
  );
}

/** The page over the mock API with the project's mastering choice, the files picked and the rows read. The mock's picker gives
 * five files, a retail sample among them; `keepSample` false removes it, as a narrator mastering through the DAW must. */
async function mount(choice: string | undefined, { keepSample = choice !== 'daw' }: { keepSample?: boolean } = {}, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides, { mastering: { choice } });
  const exportStart = vi.spyOn(api, 'exportStart');
  const exportPlan = vi.spyOn(api, 'exportPlan');
  const masteringProviders = vi.spyOn(api, 'masteringProviders');
  render(
    <ApiProvider api={api}>
      <Harness />
    </ApiProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Pick' }));
  await screen.findByRole('button', { name: 'Master & encode' });
  await waitFor(() => expect(masteringProviders).toHaveBeenCalled());
  // The chain card draws its help once the rows are read.
  await screen.findByRole('button', { name: 'About the mastering chain' });
  if (!keepSample) await userEvent.click(within(rowOf('Retail sample.wav')).getByRole('button', { name: 'Remove' }));
  return { api, exportStart, exportPlan, masteringProviders };
}

const rowOf = (file: string) => screen.getByRole('cell', { name: file }).closest('tr, [role="row"]') as HTMLElement;
const sent = (spy: { mock: { calls: unknown[][] } }): ExportRequest[] => spy.mock.calls.map((call) => call[0] as ExportRequest);
const dialog = () => screen.getByRole('alertdialog');
const press = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const pressInDialog = (name: string | RegExp) => userEvent.click(within(dialog()).getByRole('button', { name }));
const openDialog = async () => {
  await press('Master & encode');
  return screen.findByRole('alertdialog');
};

describe('Master & encode with a row that makes the DAW render (#2739)', () => {
  it('the built-in chain starts at once, with no approval and no dialog', async () => {
    const { exportStart } = await mount(undefined);
    await press('Master & encode');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it("asks first over the host's own plan: each file with the region the host will render, and approve sends that row", async () => {
    const { exportStart, exportPlan } = await mount('daw');
    await openDialog();
    expect(exportPlan).toHaveBeenCalledTimes(1);
    expect(exportStart).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading', { name: 'Approve this render?' })).toBeTruthy();
    expect(within(dialog()).getByText("Your DAW's FX chain masters 4 files for this export only.")).toBeTruthy();
    const table = within(dialog()).getByRole('table', { name: 'Files and the regions they render' });
    const opening = within(table).getByRole('cell', { name: '00 Opening credits.wav' }).closest('tr, [role="row"]') as HTMLElement;
    expect(within(opening).getByRole('cell', { name: 'Opening credits' })).toBeTruthy();
    // Focus opens on Cancel, the safe answer, not on the list.
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await pressInDialog('Approve and master');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent(exportStart)).toEqual([expect.objectContaining({ master: true, approval: { provider: 'daw', macro: '' } })]);
    // The button that opened the dialog is gone with the start; focus is on the files, never on <body>.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(screen.queryByRole('button', { name: 'Master & encode' })).toBeNull();
  });

  it('an item the DAW row has no region for is refused before any dialog, naming it, and nothing starts (walkthrough 2)', async () => {
    const { exportStart } = await mount('daw', { keepSample: true });
    await press('Master & encode');
    await findToast('Retail sample.wav has no region');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
  ])('a chapter title that is %s is refused before the dialog opens (qa B1, B2)', async (_, title) => {
    const { exportStart } = await mount('daw');
    const box = within(rowOf('Chapter 01.wav')).getByRole('textbox');
    await userEvent.clear(box);
    if (title) await userEvent.type(box, title);
    await press('Master & encode');
    await findToast('has no chapter title');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
  });

  it('cancel sends nothing, and the next press asks again', async () => {
    const { exportStart } = await mount('daw');
    const button = screen.getByRole('button', { name: 'Master & encode' });
    await openDialog();
    await pressInDialog('Cancel');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    await openDialog();
  });

  it('asks for the Audacity macro with a hint of what to type, refuses a name the host cannot run in the dialog, and sends a good one', async () => {
    const { exportStart } = await mount('audacity');
    await openDialog();
    expect(within(dialog()).getByRole('table', { name: 'Files to master' })).toBeTruthy();
    const macro = within(dialog()).getByRole('textbox', { name: 'Macro' });
    expect(macro.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(dialog()).getByText(/letters, digits, spaces, hyphens and underscores/)).toBeTruthy();
    await pressInDialog('Approve and master');
    expect(within(dialog()).getByText('Name the macro to apply.')).toBeTruthy();
    for (const bad of ['ACX – Master', '../../evil"; rm -rf /', 'loud 🔊']) {
      await userEvent.clear(macro);
      await userEvent.type(macro, bad);
      await pressInDialog('Approve and master');
      expect(within(dialog()).getByText(/A macro name can hold only/)).toBeTruthy();
    }
    expect(exportStart).not.toHaveBeenCalled();
    await userEvent.clear(macro);
    await userEvent.type(macro, '  Book loudness ');
    await pressInDialog('Approve and master');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toEqual({ provider: 'audacity', macro: 'Book loudness' });
  });

  it('a macro name the host refused is not offered again; one it took is (qa B3)', async () => {
    const { api, exportStart } = await mount('audacity');
    exportStart.mockRejectedValueOnce(new Error('invalid value: macro name "Refused one"'));
    await openDialog();
    await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Macro' }), 'Refused one');
    await pressInDialog('Approve and master');
    await findToast('invalid value: macro name "Refused one"');
    await openDialog();
    expect(within(dialog()).getByRole('textbox', { name: 'Macro' })).not.toHaveProperty('value', 'Refused one');
    await userEvent.clear(within(dialog()).getByRole('textbox', { name: 'Macro' }));
    await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Macro' }), 'Taken one');
    await pressInDialog('Approve and master');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => {
      let job = await api.exportState();
      while (job.phase === 'running') job = await api.exportState();
    });
    cleanup();
    await mount('audacity');
    await openDialog();
    expect(within(dialog()).getByRole('textbox', { name: 'Macro' })).toHaveProperty('value', 'Taken one');
  });

  it('an approval for a row without a macro sends no macro, even after an Audacity approval in this session (qa C1)', async () => {
    const { exportStart } = await mount('daw');
    await openDialog();
    expect(within(dialog()).queryByRole('textbox', { name: 'Macro' })).toBeNull();
    await pressInDialog('Approve and master');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toEqual({ provider: 'daw', macro: '' });
  });

  it('a stale approval (the row changed meanwhile) is a toast in the host words, the rows are read again, and nothing runs', async () => {
    const { api, exportStart, masteringProviders } = await mount('daw');
    await openDialog();
    const reads = masteringProviders.mock.calls.length;
    await act(() => api.masteringChooseProvider('audacity').then(() => undefined));
    await pressInDialog('Approve and master');
    await findToast("you approved Your DAW's FX chain, but this project now masters with Audacity's effect macro");
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(masteringProviders.mock.calls.length).toBeGreaterThan(reads));
    expect((await api.exportState()).phase).toBe('idle');
    expect(exportStart).toHaveBeenCalledTimes(1);
    // Asked again, the dialog shows the row the host now masters with.
    await openDialog();
    expect(within(dialog()).getByText("Audacity's effect macro masters 4 files for this export only.")).toBeTruthy();
  });

  it('a press while the start waits sends nothing more, and every control in the dialog is held', async () => {
    let answer: (() => void) | undefined;
    const { exportStart } = await mount('daw');
    exportStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({
              id: 'x',
              kind: 'render_export',
              phase: 'running',
              message: 'Preparing 4 files.',
              percent: 0,
              master: true,
              provider: 'daw',
              format: 'mp3',
              logs: [],
              elapsed: 0,
              files: [],
            });
        }),
    );
    await openDialog();
    const approve = within(dialog()).getByRole('button', { name: /Approve and master/ });
    await userEvent.click(approve);
    await userEvent.click(approve);
    expect(exportStart).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    await act(async () => answer?.());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('when the host never answers the start, the wait ends: the dialog closes, a toast says so, and the job is read again', async () => {
    const { api, exportStart } = await mount('daw');
    exportStart.mockImplementation(() => new Promise(() => undefined));
    const exportState = vi.spyOn(api, 'exportState');
    await openDialog();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await pressInDialog('Approve and master');
    await act(async () => {
      vi.advanceTimersByTime(MASTER_REQUEST_WAIT_MS + 1);
    });
    await findToast(EXPORT_START_NO_ANSWER);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportState).toHaveBeenCalled();
    // Freed: a new press asks again.
    vi.useRealTimers();
    await openDialog();
  });

  it('when the host never answers the plan, no dialog opens, a toast says so, and Master & encode is free again', async () => {
    const { exportPlan } = await mount('daw');
    exportPlan.mockImplementationOnce(() => new Promise(() => undefined));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await press('Master & encode');
    await act(async () => {
      vi.advanceTimersByTime(MASTER_REQUEST_WAIT_MS + 1);
    });
    await findToast(EXPORT_PLAN_NO_ANSWER);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    vi.useRealTimers();
    await openDialog();
  });

  it('a refusal for another reason is a toast too, and draws nothing in the page', async () => {
    const { exportStart } = await mount('daw');
    exportStart.mockRejectedValue(new Error('an export is already running'));
    await openDialog();
    await pressInDialog('Approve and master');
    await findToast('an export is already running');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toastTexts()).toHaveLength(1);
  });
});
