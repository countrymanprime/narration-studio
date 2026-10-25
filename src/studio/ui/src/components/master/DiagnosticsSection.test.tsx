// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAW_SETUPS } from '../../fixtures/daw';
import { createMockApi } from '../../api/mockApi';
import { providedCommands } from '../../input/commandProviders';
import { diagnosticsJobSchema } from '../../api/schemas/diagnostics';
import type { Bootstrap, DiagnosticsJob, NarrationApi } from '../../types';
import { MasterPage } from '../masterqc/page/MasterPage';
import { PageHost } from '../masterqc/page/testPage';

afterEach(cleanup);

type Initial = Parameters<typeof createMockApi>[1];

// The host's own payloads (written by bindings_diagnostics_contract_test.go), so the section is tested against what the host sends.
const contract = (name: string): DiagnosticsJob =>
  diagnosticsJobSchema.parse(JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'tests', 'fixtures', 'contracts', name), 'utf8')));

async function openDiagnostics({ overrides = {}, initial = {} }: { overrides?: Partial<NarrationApi>; initial?: Initial } = {}) {
  const user = userEvent.setup();
  const api = createMockApi(overrides, initial);
  render(
    <PageHost api={api}>
      <MasterPage onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
    </PageHost>,
  );
  await screen.findByRole('region', { name: 'Thresholds' });
  return { api, user };
}

/** A host that checks the picked files at its first poll and answers the success payload. */
const checksAtOnce = (): Partial<NarrationApi> => ({
  measurePickFiles: async () => ({ paths: contract('diagnostics-success.json').files.map((file) => file.path) }),
  diagnosticsAnalyze: vi.fn<NarrationApi['diagnosticsAnalyze']>().mockResolvedValue(contract('diagnostics-running.json')),
  diagnosticsState: vi
    .fn<NarrationApi['diagnosticsState']>()
    .mockResolvedValueOnce(contract('diagnostics-idle.json'))
    .mockResolvedValue(contract('diagnostics-success.json')),
});

const rowOf = (table: HTMLElement, text: string) => {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`no row with ${text}`);
  return row;
};

describe('Master & QC, Diagnostics wording', () => {
  it('names the DAW in use, never REAPER by default', async () => {
    await openDiagnostics({ initial: { daw: DAW_SETUPS.audacity } });
    await waitFor(() => expect(screen.getByText(/Listen at those times in Audacity: nothing here is saved/)).toBeTruthy());
    expect(screen.getByText(/needs the Audacity actions this app does not yet run/)).toBeTruthy();
    expect(screen.queryByText(/REAPER/)).toBeNull();
  });
});

describe('Master & QC, Diagnostics', () => {
  it('shows every threshold before anything is checked, and says nothing is checked yet', async () => {
    await openDiagnostics();
    const thresholds = await screen.findByRole('region', { name: 'Thresholds' });
    expect(within(thresholds).getByText('At or above full scale (0.0 dBFS), in runs of 3 or more samples')).toBeTruthy();
    expect(within(thresholds).getByText('A change of 4.0 LU or more')).toBeTruthy();
    expect(within(thresholds).getByText('2.0 s or longer, only from transcript timing')).toBeTruthy();
    expect(screen.getByText(/Nothing checked yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Check the measured files/ })).toBeNull();

    const cleanup = screen.getByRole('region', { name: 'Silence cleanup candidates' });
    expect(within(cleanup).getByText('0.1 s')).toBeTruthy();
    expect(within(cleanup).getByText('0.1 s to 0.9 s')).toBeTruthy();
    expect(within(cleanup).queryByRole('table', { name: 'Silence cleanup candidates' })).toBeNull();
  });

  it('opens Settings > Silence cleanup from the candidates panel', async () => {
    const openSettings = vi.fn();
    render(
      <PageHost api={createMockApi({}, {})}>
        <MasterPage onOpenDelivery={vi.fn()} openSettings={openSettings} />
      </PageHost>,
    );
    const cleanup = await screen.findByRole('region', { name: 'Silence cleanup candidates' });
    await userEvent.setup().click(within(cleanup).getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('opens the silence cleanup options from the jump menu, saved for this project, beside the Settings link', async () => {
    const save = vi.fn(async () => ({}) as Bootstrap);
    const openSettings = vi.fn();
    render(
      <PageHost api={createMockApi({ saveSettings: save } as Parameters<typeof createMockApi>[0], {})}>
        <MasterPage onOpenDelivery={vi.fn()} openSettings={openSettings} />
      </PageHost>,
    );
    const cleanup = await screen.findByRole('region', { name: 'Silence cleanup candidates' });
    expect(within(cleanup).queryByRole('textbox', { name: 'Hold kept at each side of a cut silence' })).toBeNull();
    act(() =>
      providedCommands()
        .find((command) => command.label === 'Open Silence cleanup options')!
        .run(),
    );
    const box = await screen.findByRole('textbox', { name: 'Hold kept at each side of a cut silence' });
    fireEvent.change(box, { target: { value: '0.2' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Cleanup', 'project', { pad_seconds: '0.2' }));
  });

  it('checks picked files and lists each finding with its time, measured value, threshold and source, read-only', async () => {
    const overrides = checksAtOnce();
    const { user } = await openDiagnostics({ overrides });
    await user.click(screen.getByRole('button', { name: 'Raw recordings' }));
    await user.click(screen.getByRole('button', { name: 'Rendered chapters' }));
    await user.click(screen.getByRole('button', { name: 'Choose files to check…' }));

    expect(overrides.diagnosticsAnalyze).toHaveBeenCalledWith(
      contract('diagnostics-success.json').files.map((file) => file.path),
      'processed_render',
    );
    expect(await screen.findByText('Checked 2 of 3 files; 1 could not be checked.')).toBeTruthy();
    const findings = screen.getByRole('table', { name: 'Findings' });
    const shift = rowOf(findings, 'Level shift');
    expect(within(shift).getByText('15:05.0 – 15:06.0')).toBeTruthy();
    expect(within(shift).getByText('−19.5 to −25.3 LUFS (−5.8 LU)')).toBeTruthy();
    expect(within(shift).getByText('A change of 4.0 LU or more')).toBeTruthy();
    expect(within(shift).getByText('Chapter 01.wav')).toBeTruthy();
    expect(within(shift).getByText('Rendered chapter, whole file')).toBeTruthy();
    expect(within(rowOf(findings, 'Room-tone change')).getByText('Info')).toBeTruthy();
    expect(within(rowOf(findings, 'Clipping')).getByText('Warning')).toBeTruthy();
    // Read-only: nothing to decide, play or send to REAPER here.
    expect(within(findings).queryAllByRole('button')).toEqual([]);
    expect(screen.getByText(/nothing here is saved, played or changed/i)).toBeTruthy();

    const files = screen.getByRole('table', { name: 'Checked files' });
    expect(within(rowOf(files, 'Chapter 02.wav')).getByText('Not available: no transcript timing for this audio')).toBeTruthy();
    expect(within(rowOf(files, 'Chapter 03.mp3')).getByText('Could not be checked: not a RIFF/WAVE file')).toBeTruthy();
    expect(screen.getByText('Checked 2 of 3 files; 1 could not be checked.')).toBeTruthy();
    expect(screen.getByText('3 findings to listen to.')).toBeTruthy();
  });

  it('lists silence cleanup candidates apart from Findings, read-only', async () => {
    const overrides = checksAtOnce();
    const { user } = await openDiagnostics({ overrides });
    await user.click(screen.getByRole('button', { name: 'Choose files to check…' }));
    await screen.findByText('Checked 2 of 3 files; 1 could not be checked.');

    const candidates = screen.getByRole('table', { name: 'Silence cleanup candidates' });
    expect(within(rowOf(candidates, 'Silence')).getByText(/1\.00 s below the silence floor/)).toBeTruthy();
    expect(within(rowOf(candidates, 'Breath')).getByText(/quiet and strongly noise-like/)).toBeTruthy();
    expect(within(rowOf(candidates, 'Click')).getByText(/a burst of 30 ms with silence on both sides/)).toBeTruthy();
    // Not mixed into the plain Findings table above.
    const findings = screen.getByRole('table', { name: 'Findings' });
    expect(within(findings).queryAllByText(/silence candidate|breath candidate|click candidate/)).toEqual([]);
    // Read-only: nothing to apply from this list.
    expect(within(candidates).queryAllByRole('button')).toEqual([]);
  });

  it('checks the files already measured without picking them again', async () => {
    const { api, user } = await openDiagnostics();
    await user.click(await screen.findByRole('button', { name: 'Check files…' }));
    await waitFor(async () => expect((await api.measureState()).phase).not.toBe('running'), { timeout: 10_000 });
    await user.click(await screen.findByRole('button', { name: 'Check the 3 measured files' }));
    expect(await screen.findByRole('table', { name: 'Findings' }, { timeout: 10_000 })).toBeTruthy();
    expect((await api.diagnosticsState()).sourceKind).toBe('processed_render');
  }, 20_000);

  it('says so when nothing crossed a threshold, without calling it a pass', async () => {
    const quiet = contract('diagnostics-success.json');
    const none = { ...quiet, files: quiet.files.slice(1, 2), message: 'Checked 1 file.' };
    await openDiagnostics({ overrides: { diagnosticsState: async () => none } });
    expect(await screen.findByText(/Nothing reached a threshold in the checked files\. That is not a pass/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Findings' })).toBeNull();
  });

  it('shows a running check with its real progress, and Cancel', async () => {
    const { user, api } = await openDiagnostics({ initial: { diagnostics: 'hold' } });
    await api.measurePickFiles();
    await user.click(screen.getByRole('button', { name: 'Choose files to check…' }));
    expect(await screen.findByRole('progressbar', { name: 'Checking' })).toBeTruthy();
    expect(screen.getByText('Checking Chapter 01.wav (1 of 3).')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Raw recordings' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Diagnostics cancelled. 0 of 3 files were checked.')).toBeTruthy();
  });

  it('says a reason several files share once, never calls a broken check cancelled, and gives severity a pill (R3MS-3, R3MS-15)', async () => {
    await openDiagnostics({ overrides: { diagnosticsState: async () => contract('diagnostics-cancelled.json') } });
    const table = await screen.findByRole('table', { name: 'Checked files' });
    expect(within(table).queryByText(/cancelled/)).toBeNull();
    cleanup();
    await openDiagnostics({ overrides: { diagnosticsState: async () => contract('diagnostics-success.json') } });
    const findings = await screen.findByRole('table', { name: 'Findings' });
    const row = within(findings).getAllByRole('row')[1]!;
    // Every cell of a finding starts at the top of its row, so their first lines are level.
    expect([...row.querySelectorAll('td')].every((td) => td.className.includes('align-top'))).toBe(true);
    expect(within(row).getByText('Warning').className).toContain('rounded-full');
  });

  it('says so when the check broke, and shows the host’s refusal to start', async () => {
    await openDiagnostics({ overrides: { diagnosticsState: async () => contract('diagnostics-error.json') } });
    expect(await screen.findByText(/The diagnostics stopped unexpectedly\. Choose the files again/)).toBeTruthy();
    cleanup();

    const { user } = await openDiagnostics({
      overrides: { diagnosticsAnalyze: async () => Promise.reject(new Error('a diagnostics check is already running')) },
    });
    await user.click(screen.getByRole('button', { name: 'Choose files to check…' }));
    expect((await screen.findByRole('alert')).textContent).toContain('a diagnostics check is already running');
  });
});
