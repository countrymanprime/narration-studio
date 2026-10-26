// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { CoverageEngines, CoverageResult, CoverageStartOptions, CoverageStartResult, CoverageState } from '../../api/contracts/coverage';
import type { DawCapabilities } from '../../api/contracts/daw';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { createMockApi } from '../../api/mockApi';
import { createOverlayService } from '../../overlay/overlayService';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import type { NarrationApi } from '../../types';
import { COVERAGE_REASON_TEXT } from '../production/recordingCheckText';
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
  defaults: { recheck: false, recheckModel: 'large', recheckBelow: 0.5, workers: 0, chunkSeconds: 300, overlapSeconds: 6, chapters: 1 },
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
  const sent: Array<CoverageStartOptions | undefined> = [];
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
      sent.push(options);
      const runId = `run-${++runs}`;
      return { status: 'started', state: { runId, chapterId: id, phase: 'running', percent: 0, message: '' } };
    },
    coverageCancel: async () => undefined,
    ...overrides,
  });
  const emit = (state: Partial<CoverageState> & { runId: string; phase: CoverageState['phase'] }) => act(() => listener({ percent: 0, message: '', ...state }));
  return { api, starts, sent, results, emit };
}

function open(api: NarrationApi, preselected: string[] = [], opener = true, options: Parameters<typeof openCheckRecordings>[1] = {}) {
  const service = createOverlayService();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <button type="button">Check icon</button>
        <OverlayProvider service={service} />
      </ApiProvider>
    </MemoryRouter>,
  );
  if (opener) screen.getByText('Check icon').focus();
  const close = act(() => openCheckRecordings(preselected, options, service));
  return { service, close };
}

const toasts = (service: ReturnType<typeof createOverlayService>) => service.getSnapshot().toasts.map((t) => t.text);

describe('CheckRecordingsDialog', () => {
  it('offers-a-chapter-the-manuscript-does-not-list-ticked-and-checks-it', async () => {
    // A credits row's synthetic chapter: no recording measured, never in the manuscript, still checked by its own id.
    const { api, starts } = host();
    const credits = chapter('credits-opening', { title: 'Opening credits', recordedSeconds: undefined, wordCount: 0 });
    open(api, ['credits-opening'], true, { extra: [credits] });
    const dialog = await screen.findByRole('dialog', { name: 'Check recordings' });
    expect(
      within(dialog)
        .getByRole('checkbox', { name: /Opening credits/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check 1 chapter' }));
    await waitFor(() => expect(starts).toEqual([{ id: 'credits-opening', model: 'small' }]));
  });

  it('shows-the-full-report-after-a-single-chapter-run-with-go-to-paragraph-and-check-again', async () => {
    const { api, results, emit } = host();
    open(api, ['a']);
    await userEvent.click(await screen.findByRole('button', { name: 'Check 1 chapter' }));
    results.a = {
      chapterId: 'a',
      state: 'current',
      reasons: [],
      record: { completedAt: '2026-10-20T10:00:00Z' },
      result: {
        model: 'small',
        alignment: { maxMisreadRun: 8, minAnchorRun: 3 },
        bodyTokens: 100,
        presentTokens: 84,
        missingTokens: 16,
        extraTokens: 0,
        longestMissingRun: 16,
        playedSeconds: 60,
        items: [],
        paragraphs: [
          { id: 'p-a', tokens: 50, present: 50, longestMissingRun: 0 },
          { id: 'p-b', tokens: 50, present: 34, longestMissingRun: 16 },
        ],
        regions: [],
      },
    } as unknown as CoverageResult;
    emit({ runId: 'run-1', phase: 'complete' });
    const dialog = await screen.findByRole('dialog', { name: 'Check recordings' });
    expect(await within(dialog).findByText('Text present')).toBeTruthy();
    expect(within(dialog).getByText(/Checked .* with the small Whisper model/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Open in Editing' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to chapters' }));
    expect(await within(dialog).findByRole('button', { name: 'Show result: Chapter a' })).toBeTruthy();
  });

  it('asks-before-downloading-a-missing-model-and-checks-once-it-is-installed', async () => {
    let installed = false;
    const installs: string[] = [];
    const { api, starts } = host({
      coverageStart: async (id, options) => {
        starts.push({ id, model: options?.model });
        if (!installed)
          return {
            status: 'asset_required',
            model: { id: 'small', displayName: 'Whisper small', version: '1', publisher: 'OpenAI', license: 'MIT' },
            installState: 'not_installed',
            downloadSize: 1,
            diskSize: 1,
            installPath: '/models',
          } as unknown as CoverageStartResult;
        return { status: 'started', state: { runId: 'r-1', chapterId: id, phase: 'running', percent: 0, message: '' } };
      },
      whisperInstall: async (modelId) => {
        installs.push(modelId);
        installed = true;
        return { id: 'job-1', modelId, phase: 'success', message: 'Installed', percent: 100 } as never;
      },
      whisperInstallState: async () => ({ id: 'job-1', modelId: 'small', phase: 'success', message: 'Installed', percent: 100 }) as never,
    });
    open(api, ['a']);
    await userEvent.click(await screen.findByRole('button', { name: 'Check 1 chapter' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Download local Whisper model?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Download model' }));
    await waitFor(() => expect(installs).toEqual(['small']));
    await waitFor(() => expect(starts).toHaveLength(2));
    expect(await screen.findByRole('button', { name: 'Stop checking' })).toBeTruthy();
  });

  it('offers-the-first-pass-alone-when-the-larger-model-is-missing', async () => {
    const { api, sent } = host({
      coverageStart: async (id, options) => {
        sent.push(options);
        if (options?.recheck)
          return {
            status: 'recheck_asset_required',
            model: { id: 'large', displayName: 'Whisper large', version: '1', publisher: 'OpenAI', license: 'MIT' },
            installState: 'not_installed',
            downloadSize: 1,
            diskSize: 1,
            installPath: '/models',
          } as unknown as CoverageStartResult;
        return { status: 'started', state: { runId: 'r-1', chapterId: id, phase: 'running', percent: 0, message: '' } };
      },
    });
    open(api, ['a']);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Look again with a larger model/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Download the re-check model?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Check with Whisper small only' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ model: 'small', recheck: false });
  });

  it('tells-the-opener-once-however-it-closes', async () => {
    const { api } = host();
    const onClosed = vi.fn();
    const { service } = open(api, ['a'], true, { onClosed });
    await screen.findByRole('button', { name: 'Check 1 chapter' });
    expect(onClosed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('lists-the-hosts-engines-only', async () => {
    const { api } = host();
    open(api);
    const select = (await screen.findByRole('combobox', { name: 'Speech model' })) as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whisper tiny', 'Whisper small', 'Whisper large (not installed)']);
    expect(select.value).toBe('small');
    expect(screen.queryByText(/moonshine/i)).toBeNull();
    await userEvent.selectOptions(select, 'large');
    expect(screen.getByText('Whisper large is not installed yet: Check asks before downloading it.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    // A model that is not installed does not stop Check: the start asks to download it.
    expect((screen.getByRole('button', { name: /^Check \d/ }) as HTMLButtonElement).disabled).toBe(false);
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
    expect(screen.queryByText('Estimated time')).toBeNull();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Stop checking' }));
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

  it('refusals-are-shown-in-plain-words-with-the-host-words-and-the-page-that-fixes-them', async () => {
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
    const dialog = await screen.findByRole('dialog');
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('The recording could not be checked')).toBeTruthy();
    expect(within(alert).getByText(COVERAGE_REASON_TEXT.unmapped)).toBeTruthy();
    // The track link is made right in the row, as the chapter's own panel did.
    expect(await within(alert).findByRole('combobox', { name: /^Track for Chapter a/ })).toBeTruthy();
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

    act(() => openCheckRecordings(['a'], {}, service));
    await userEvent.click(await screen.findByRole('button', { name: 'Check 1 chapter' }));
    await waitFor(() => expect(starts).toHaveLength(1));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(service.getSnapshot().dialogs.filter((d) => d.kind !== 'confirm')).toHaveLength(1);
  });

  describe('how a run is made', () => {
    beforeEach(() => vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8 }));
    afterEach(() => vi.unstubAllGlobals());
    const option = (name: string) => screen.findByRole('combobox', { name });
    const slider = (name: string) => screen.findByRole('slider', { name });

    it('begins at what the host would do and says it in words', async () => {
      const { api } = host();
      open(api, ['a']);
      const chunk = (await slider('Chunk length')) as HTMLInputElement;
      // The host's 300 s is past the slider's 120 s: the readout keeps the real figure and the thumb rests at the end.
      expect(chunk.value).toBe('120');
      expect(screen.getByText('300 s')).toBeTruthy();
      expect((screen.getByRole('slider', { name: 'Overlap between chunks' }) as HTMLInputElement).value).toBe('6');
      expect(screen.getByText('Automatic')).toBeTruthy();
      expect((screen.getByRole('checkbox', { name: /Look again with a larger model/ }) as HTMLInputElement).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('Whisper small in 5 min chunks that overlap by 6 s, as many at a time as the model allows.')).toBeTruthy();
      expect(screen.queryByRole('combobox', { name: 'Larger model' })).toBeNull();
      expect(screen.queryByText(/Checking recordings runs speech recognition/)).toBeNull();
    });

    it('the sliders cover the mock ranges', async () => {
      const { api } = host();
      open(api, ['a']);
      const chunk = (await slider('Chunk length')) as HTMLInputElement;
      expect([chunk.min, chunk.max, chunk.step]).toEqual(['10', '120', '5']);
      const overlap = screen.getByRole('slider', { name: 'Overlap between chunks' }) as HTMLInputElement;
      expect([overlap.min, overlap.max, overlap.step]).toEqual(['0', '10', '1']);
      const workers = screen.getByRole('slider', { name: 'Parallel workers' }) as HTMLInputElement;
      expect([workers.min, workers.max, workers.step]).toEqual(['1', '8', '1']);
    });

    it('sends every choice, so the host runs what the dialog showed', async () => {
      const { api, sent } = host();
      open(api, ['a']);
      await userEvent.click(await screen.findByRole('checkbox', { name: /Let the model choose the workers/ }));
      const workers = screen.getByRole('slider', { name: 'Parallel workers' });
      workers.focus();
      await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
      const chunk = screen.getByRole('slider', { name: 'Chunk length' });
      chunk.focus();
      await userEvent.keyboard('{Home}{End}');
      const overlap = screen.getByRole('slider', { name: 'Overlap between chunks' });
      overlap.focus();
      await userEvent.keyboard('{End}');
      await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toEqual({ model: 'small', recheck: false, workers: 3, chunkSeconds: 120, overlapSeconds: 10, chapters: 1 });
    });

    it('a second look names the larger model and the score under which a passage is looked at again', async () => {
      const { api, sent } = host();
      open(api, ['a']);
      await userEvent.click(await screen.findByRole('checkbox', { name: /Look again with a larger model/ }));
      const larger = (await option('Larger model')) as HTMLSelectElement;
      expect(larger.value).toBe('large');
      expect(screen.getByText('Whisper large is not installed yet: Check asks before downloading it.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Check 1 chapter' }) as HTMLButtonElement).disabled).toBe(false);
      await userEvent.selectOptions(larger, 'tiny');
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Also look again at words scored under' }), '0.4');
      expect(screen.getByText(/Then Whisper tiny re-checks what is missing and words scored under 40%\./)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ model: 'small', recheck: true, recheckModel: 'tiny', recheckBelow: 0.4 });
    });

    it('a second look by the same model is refused in words', async () => {
      const { api } = host();
      open(api, ['a']);
      await userEvent.click(await screen.findByRole('checkbox', { name: /Look again with a larger model/ }));
      await userEvent.selectOptions(await option('Larger model'), 'small');
      expect(screen.getByText('Choose a different model to re-check with.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Check 1 chapter' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('an item taken whole has one process and no crossover to choose', async () => {
      const { api, sent } = host();
      open(api, ['a']);
      await userEvent.click(await screen.findByRole('checkbox', { name: /Transcribe each recording whole/ }));
      expect((screen.getByRole('slider', { name: 'Parallel workers' }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('slider', { name: 'Overlap between chunks' }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('slider', { name: 'Chunk length' }) as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByText('Whisper small over each recording whole, one process.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ workers: 1, chunkSeconds: 0 });
    });

    it('shows a setting the sliders do not reach instead of silently changing it', async () => {
      const odd: CoverageEngines = { ...engines, defaults: { ...engines.defaults, chunkSeconds: 240, overlapSeconds: 7, workers: 5, recheckBelow: 0.45 } };
      const { api, sent } = host({ coverageEngines: async () => odd });
      open(api, ['a']);
      await slider('Chunk length');
      expect(screen.getByText('240 s')).toBeTruthy();
      expect(screen.getByText('7 s')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ chunkSeconds: 240, overlapSeconds: 7, workers: 5 });
    });

    it('the settings default of a second look starts checked', async () => {
      const on: CoverageEngines = { ...engines, defaults: { ...engines.defaults, recheck: true, recheckModel: 'tiny' } };
      const { api, sent } = host({ coverageEngines: async () => on });
      open(api, ['a']);
      expect(((await option('Larger model')) as HTMLSelectElement).value).toBe('tiny');
      await userEvent.click(screen.getByRole('button', { name: 'Check 1 chapter' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ recheck: true, recheckModel: 'tiny' });
    });
  });

  describe('several chapters at once', () => {
    beforeEach(() => vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8 }));
    afterEach(() => vi.unstubAllGlobals());

    it('starts as many as the choice names together and the next as each ends, every start naming the same number', async () => {
      const { api, starts, sent, emit } = host();
      open(api, ['a', 'b', 'c']);
      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Chapters at once' }), '2');
      expect(screen.getByText(/Up to 2 chapters at once\./)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Check 3 chapters' }));
      await waitFor(() => expect(starts.map((start) => start.id)).toEqual(['a', 'b']));
      expect(sent.every((options) => options?.chapters === 2)).toBe(true);
      const bars = await screen.findAllByRole('progressbar');
      expect(bars).toHaveLength(3);
      emit({ runId: 'run-2', phase: 'running', percent: 60 });
      emit({ runId: 'run-1', phase: 'running', percent: 20 });
      expect((await screen.findByRole('progressbar', { name: /Checking Chapter b/ })).getAttribute('aria-valuenow')).toBe('60');
      expect(screen.getByRole('progressbar', { name: /Checking Chapter a/ }).getAttribute('aria-valuenow')).toBe('20');
      expect(screen.getByRole('progressbar', { name: /Checking Chapter c/ }).getAttribute('aria-valuenow')).toBe('0');
      emit({ runId: 'run-2', phase: 'complete', percent: 100 });
      await waitFor(() => expect(starts.map((start) => start.id)).toEqual(['a', 'b', 'c']));
      expect(sent).toHaveLength(3);
    });

    it('does not offer chapters at once for a chapter alone and sends one chapter at a time by default', async () => {
      const { api, sent } = host();
      open(api, ['a', 'b']);
      expect(((await screen.findByRole('combobox', { name: 'Chapters at once' })) as HTMLSelectElement).value).toBe('1');
      await userEvent.click(screen.getByRole('button', { name: 'Check 2 chapters' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]?.chapters).toBe(1);
    });

    it('stop says how many chapters in progress stored nothing', async () => {
      const { api, starts, emit, results } = host();
      const { service } = open(api, ['a', 'b', 'c']);
      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Chapters at once' }), '2');
      await userEvent.click(screen.getByRole('button', { name: 'Check 3 chapters' }));
      await waitFor(() => expect(starts).toHaveLength(2));
      results.a = stored('current');
      emit({ runId: 'run-1', phase: 'complete', percent: 100 });
      await waitFor(() => expect(starts).toHaveLength(3));
      await userEvent.click(await screen.findByRole('button', { name: 'Stop checking' }));
      await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
      expect(toasts(service)).toEqual(['Stopped. 1 chapter finished and kept; the 2 in progress stored nothing.']);
    });
  });
});
