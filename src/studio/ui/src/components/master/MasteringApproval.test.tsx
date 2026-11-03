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
import { EXPORT_START_WAIT_MS } from './exportStartRequest';
import { EXPORT_START_NO_ANSWER, useExportJobs } from './useExportJobs';

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

/** The page over the mock API with the project's mastering choice, the files picked and the rows read. */
async function mount(choice: string | undefined, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides, { mastering: { choice } });
  const exportStart = vi.spyOn(api, 'exportStart');
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
  return { api, exportStart, masteringProviders };
}

const sent = (spy: { mock: { calls: unknown[][] } }): ExportRequest[] => spy.mock.calls.map((call) => call[0] as ExportRequest);
const dialog = () => screen.getByRole('alertdialog');

describe('Master & encode with a row that makes the DAW render (#2739)', () => {
  it('the built-in chain starts at once, with no approval and no dialog', async () => {
    const { exportStart } = await mount(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks first, naming the row and the regions it renders, and approve sends that row with this one start', async () => {
    const { exportStart } = await mount('daw');
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    expect(exportStart).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading', { name: "Master with Your DAW's FX chain?" })).toBeTruthy();
    const regions = within(dialog()).getByRole('list', { name: 'Regions to render' });
    expect(within(regions).getByText('Opening credits')).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent(exportStart)).toEqual([expect.objectContaining({ master: true, approval: { provider: 'daw', macro: '' } })]);
    // The button that opened the dialog is gone with the start; focus is on the files, never on <body>.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(screen.queryByRole('button', { name: 'Master & encode' })).toBeNull();
  });

  it('cancel sends nothing, and the next press asks again', async () => {
    const { exportStart } = await mount('daw');
    const button = screen.getByRole('button', { name: 'Master & encode' });
    await userEvent.click(button);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(dialog()).toBeTruthy();
  });

  it('asks for the Audacity macro, refuses to send without one, and sends the name it was given', async () => {
    const { exportStart } = await mount('audacity');
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    const macro = within(dialog()).getByRole('textbox', { name: 'Macro' });
    expect(document.activeElement).toBe(macro);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    expect(exportStart).not.toHaveBeenCalled();
    expect(within(dialog()).getByText('Name the macro to apply.')).toBeTruthy();
    await userEvent.type(macro, '  Book loudness ');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toEqual({ provider: 'audacity', macro: 'Book loudness' });
  });

  it('a stale approval (the row changed meanwhile) is a toast in the host words, the rows are read again, and nothing runs', async () => {
    const { api, exportStart, masteringProviders } = await mount('daw');
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    const reads = masteringProviders.mock.calls.length;
    await act(() => api.masteringChooseProvider('audacity').then(() => undefined));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    await findToast("you approved Your DAW's FX chain, but this project now masters with Audacity's effect macro");
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(masteringProviders.mock.calls.length).toBeGreaterThan(reads));
    expect((await api.exportState()).phase).toBe('idle');
    expect(exportStart).toHaveBeenCalledTimes(1);
    // Asked again, the dialog names the row the host now masters with.
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await waitFor(() => expect(within(dialog()).getByRole('heading', { name: "Master with Audacity's effect macro?" })).toBeTruthy());
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
              message: 'Preparing 5 files.',
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
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    const approve = within(dialog()).getByRole('button', { name: /Approve and master/ });
    await userEvent.click(approve);
    await userEvent.click(approve);
    expect(exportStart).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    await act(async () => answer?.());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('when the host never answers, the wait ends: the dialog closes, a toast says so, and the job is read again', async () => {
    const { api, exportStart } = await mount('daw');
    exportStart.mockImplementation(() => new Promise(() => undefined));
    const exportState = vi.spyOn(api, 'exportState');
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    await act(async () => {
      vi.advanceTimersByTime(EXPORT_START_WAIT_MS + 1);
    });
    await findToast(EXPORT_START_NO_ANSWER);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportState).toHaveBeenCalled();
    // Freed: a new press asks again.
    vi.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    expect(dialog()).toBeTruthy();
  });

  it('a refusal for another reason is a toast too, and draws nothing in the page', async () => {
    const { exportStart } = await mount('daw');
    exportStart.mockRejectedValue(new Error('an export is already running'));
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve and master' }));
    await findToast('an export is already running');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toastTexts()).toHaveLength(1);
  });
});
