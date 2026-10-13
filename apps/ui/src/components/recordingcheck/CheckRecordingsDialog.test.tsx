// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { CoverageEngines, CoverageResult, CoverageState } from '../../api/contracts/coverage';
import type { DawCapabilities } from '../../api/contracts/daw';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { createMockApi } from '../../api/mockApi';
import { createOverlayService } from '../../overlay/overlayService';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import type { NarrationApi } from '../../types';
import { openCheckRecordings } from './openCheckRecordings';

afterEach(cleanup);

const chapter = (id: string, extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id,
  title: `Chapter ${id}`,
  index: 1,
  wordCount: 100,
  status: 'recording',
  recordedSeconds: 600,
  ...extra,
});
const engines: CoverageEngines = {
  default: 'small',
  engines: [
    { id: 'tiny', label: 'Whisper tiny', family: 'whisper', installState: 'installed' },
    { id: 'small', label: 'Whisper small', family: 'whisper', installState: 'installed' },
    { id: 'large', label: 'Whisper large', family: 'whisper', installState: 'not_installed' },
  ],
};
const stored = (state: CoverageResult['state'], gaps = 0, unfinished = { start: 0, end: 0 }): CoverageResult =>
  ({
    chapterId: 'x',
    state,
    reasons: [],
    result: {
      model: 'small',
      paragraphs: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, tokens: 1, present: 1, longestMissingRun: 0 })),
      gaps: Array.from({ length: gaps }, (_, i) => ({ id: `g${i}` })),
      unfinished,
    },
  }) as unknown as CoverageResult;
const never = (chapterId: string): CoverageResult => ({ chapterId, state: 'never', reasons: [] });

/** A host whose runs the test ends by hand: `emit` plays the coverage:state event, `starts` records every start. */
function host(overrides: Partial<NarrationApi> = {}) {
  let listener: (state: CoverageState) => void = () => undefined;
  const starts: Array<{ id: string; model?: string }> = [];
  const results: Record<string, CoverageResult> = {};
  let runs = 0;
  const api = createMockApi({
    manuscriptChapters: async () => [
      chapter('a'),
      chapter('b'),
      chapter('c', { recordedSeconds: undefined, recordedFraction: 0.5 }),
      chapter('none', { recordedSeconds: 0 }),
    ],
    coverageEngines: async () => engines,
    coverageResult: async (id) => results[id] ?? never(id),
    subscribeCoverage: (onUpdate) => {
      listener = onUpdate;
      return () => undefined;
    },
    coverageStart: async (id, options) => {
      starts.push({ id, model: options?.model });
      const runId = `run-${++runs}`;
      return { status: 'started', state: { runId, chapterId: id, phase: 'running', percent: 0, message: '' } };
    },
    coverageCancel: async () => undefined,
    ...overrides,
  });
  const emit = (state: Partial<CoverageState> & { runId: string; phase: CoverageState['phase'] }) => act(() => listener({ percent: 0, message: '', ...state }));
  return { api, starts, results, emit };
}

function open(api: NarrationApi, preselected: string[] = [], opener = true) {
  const service = createOverlayService();
  render(
    <ApiProvider api={api}>
      <button type="button">Check icon</button>
      <OverlayProvider service={service} />
    </ApiProvider>,
  );
  if (opener) screen.getByText('Check icon').focus();
  const close = act(() => openCheckRecordings(preselected, service));
  return { service, close };
}

const toasts = (service: ReturnType<typeof createOverlayService>) => service.getSnapshot().toasts.map((t) => t.text);

describe('CheckRecordingsDialog', () => {
  it('lists-the-hosts-engines-only', async () => {
    const { api } = host();
    open(api);
    const select = (await screen.findByRole('combobox', { name: 'Speech model' })) as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whisper tiny', 'Whisper small', 'Whisper large (Download it in Settings)']);
    expect(select.value).toBe('small');
    expect(screen.queryByText(/moonshine/i)).toBeNull();
    await userEvent.selectOptions(select, 'large');
    expect(screen.getByText('Download it in Settings')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect((screen.getByRole('button', { name: /^Check \d/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists-recorded-chapters-with-their-state', async () => {
    const { api, results } = host();
    results.a = stored('current', 2, { start: 0, end: 2 });
    results.b = stored('stale');
    open(api, ['b', 'none']);
    await screen.findByRole('checkbox', { name: /Chapter a/ });
    expect(screen.queryByText('Chapter none')).toBeNull();
    expect(screen.getByText('Checked, as of last save')).toBeTruthy();
    expect(screen.getByText('small · 2 lines to redo · read 4 of 6 paragraphs')).toBeTruthy();
    expect(screen.getByText('Out of date')).toBeTruthy();
    expect(screen.getByText('Not checked yet')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Chapter b/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: /Chapter a/ }).getAttribute('aria-checked')).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Check 3 chapters' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'None' }));
    expect((screen.getByRole('button', { name: 'Check 0 chapters' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('audio-to-check-is-measured', async () => {
    const { api } = host();
    open(api, ['a', 'b', 'c']);
    await screen.findByText('Audio to check');
    expect(screen.getByText('20 min')).toBeTruthy();
    expect(screen.getByText('1 chapter left out: length not measured')).toBeTruthy();
    expect(screen.getByText('Not measured yet')).toBeTruthy();
  });

  it('audio-to-check-says-not-measured-rather-than-0-min', async () => {
    const { api } = host({
      manuscriptChapters: async () => [
        chapter('c', { recordedSeconds: undefined, recordedFraction: 0.5 }),
        chapter('d', { recordedSeconds: undefined, recordedFraction: 1 }),
      ],
    });
    open(api, ['c', 'd']);
    await screen.findByText('Audio to check');
    expect(screen.getByText('Not measured')).toBeTruthy();
    expect(screen.queryByText('0 min')).toBeNull();
    expect(screen.getByText('2 chapters left out: length not measured')).toBeTruthy();
  });

  it('run-checks-chapters-one-at-a-time', async () => {
    const { api, starts, emit } = host();
    open(api, ['a', 'b']);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Speech model' }), 'tiny');
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 chapters' }));
    await waitFor(() => expect(starts).toEqual([{ id: 'a', model: 'tiny' }]));
    emit({ runId: 'run-1', phase: 'running', percent: 42 });
    expect((await screen.findByRole('progressbar', { name: /Checking Chapter a/ })).getAttribute('aria-valuenow')).toBe('42');
    expect(starts).toHaveLength(1);
    emit({ runId: 'run-1', phase: 'complete', percent: 100 });
    await waitFor(() =>
      expect(starts).toEqual([
        { id: 'a', model: 'tiny' },
        { id: 'b', model: 'tiny' },
      ]),
    );
  });

  it('stop-keeps-what-finished', async () => {
    const cancel = vi.fn(async () => undefined);
    const { api, starts, emit, results } = host({ coverageCancel: cancel });
    const { service } = open(api, ['a', 'b']);
    await userEvent.click(await screen.findByRole('button', { name: 'Check 2 chapters' }));
    await waitFor(() => expect(starts).toHaveLength(1));
    results.a = stored('current');
    emit({ runId: 'run-1', phase: 'complete', percent: 100 });
    await waitFor(() => expect(starts).toHaveLength(2));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
    expect(toasts(service)).toEqual(['Stopped. 1 chapter finished and kept; the one in progress stored nothing.']);
  });

  it('finished-says-what-it-found', async () => {
    const { api, starts, emit, results } = host();
    const { service } = open(api, ['a', 'b']);
    await userEvent.click(await screen.findByRole('button', { name: 'Check 2 chapters' }));
    await waitFor(() => expect(starts).toHaveLength(1));
    results.a = stored('current', 2, { start: 0, end: 3 });
    emit({ runId: 'run-1', phase: 'complete' });
    await waitFor(() => expect(starts).toHaveLength(2));
    results.b = stored('current', 1);
    emit({ runId: 'run-2', phase: 'complete' });
    await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
    expect(toasts(service)).toEqual(['Checked 2 chapters · 3 lines to redo · 1 not recorded to the end']);
  });

  it('refusals-are-shown-in-the-host-words', async () => {
    const starts: string[] = [];
    const { api, emit } = host({
      coverageStart: async (id) => {
        starts.push(id);
        if (id === 'a') return { status: 'refused', reason: 'unmapped', message: 'Link a REAPER track to this chapter first.' };
        return { status: 'started', state: { runId: 'r-b', chapterId: id, phase: 'running', percent: 0, message: '' } };
      },
    });
    const { service } = open(api, ['a', 'b']);
    await userEvent.click(await screen.findByRole('button', { name: 'Check 2 chapters' }));
    await waitFor(() => expect(starts).toEqual(['a', 'b']));
    emit({ runId: 'r-b', phase: 'complete' });
    expect(await within(await screen.findByRole('dialog')).findByText('Link a REAPER track to this chapter first.')).toBeTruthy();
    expect(service.getSnapshot().dialogs).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Check 2 chapters' })).toBeTruthy();
  });

  it('disabled-without-the-daw', async () => {
    const message = 'REAPER is not answering. Start it and open the project.';
    const caps: DawCapabilities = {
      daw: 'REAPER',
      reachable: false,
      capabilities: { review: { level: 'supported', available: false, reason: 'not_running', message } },
    };
    const { api } = host({ dawCapabilities: async () => caps, subscribeDawCapabilities: () => () => undefined });
    open(api, ['a']);
    expect(await screen.findByText(message)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Check 1 chapter' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Chapter a/ })).toBeTruthy();
  });

  it('dialog-behaviour: titled, Escape closes when idle, asks first while running, focus returns', async () => {
    const { api, starts } = host();
    const { service } = open(api, ['a']);
    const dialog = await screen.findByRole('dialog', { name: 'Check recordings' });
    expect(dialog).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Check icon')));

    act(() => openCheckRecordings(['a'], service));
    await userEvent.click(await screen.findByRole('button', { name: 'Check 1 chapter' }));
    await waitFor(() => expect(starts).toHaveLength(1));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(service.getSnapshot().dialogs.filter((d) => d.kind !== 'confirm')).toHaveLength(1);
  });
});
