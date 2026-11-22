// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompareRun } from './CompareRun';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import { WIRE_DISCREPANCIES } from '../../api/mockFixtures';

afterEach(cleanup);

describe('CompareRun actions that answer late or fail', () => {
  it('Cancel says it was heard, ignores a second press, and reports a cancel the host refuses', async () => {
    const hang = vi.fn(() => new Promise<void>(() => {}));
    const notify = vi.fn();
    const { unmount } = render(
      <ApiProvider api={createMockApi({ transcriptCancel: hang })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'running' }}
          notify={notify}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(cancel.getAttribute('aria-busy')).toBe('true'));
    expect(hang).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ApiProvider api={createMockApi({ transcriptCancel: () => Promise.reject(new Error('the comparison already ended')) })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'running' }}
          notify={notify}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('the comparison already ended'), 'error'));
  });
});

describe('CompareRun DAW-link gating', () => {
  it('gates Start comparison without a linked DAW file, and lets it run once linked', async () => {
    const transcriptStart = vi.fn().mockResolvedValue({ status: 'started' });
    const props = {
      chapterTitle: 'Chapter 1',
      state: WIRE_TRANSCRIPT,
      notify: vi.fn(),
      reviewingLast: false,
      onReviewLast: vi.fn(),
      onCloseLast: vi.fn(),
      foundHere: 0,
    };
    const { rerender } = render(
      <ApiProvider api={createMockApi({ transcriptStart })}>
        <CompareRun {...props} dawFileLinked={false} />
      </ApiProvider>,
    );
    const gated = screen.getByRole('button', { name: /Start comparison/ });
    expect(gated.getAttribute('aria-disabled')).toBe('true');
    // The reason is the button's description and, in sight, beside it (alignment audit XPC-15).
    expect(screen.getAllByText('Link a REAPER project (.rpp) file to start a comparison.')).toHaveLength(2);
    fireEvent.click(gated);
    expect(transcriptStart).not.toHaveBeenCalled();

    rerender(
      <ApiProvider api={createMockApi({ transcriptStart })}>
        <CompareRun {...props} dawFileLinked />
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Start comparison/ }));
    // The chapter view names its own chapter, so the host never guesses it from the track name.
    await waitFor(() => expect(transcriptStart).toHaveBeenCalledWith(expect.objectContaining({ chapterTitle: 'Chapter 1' })));
  });

  // The DAW port's review capability, moved from the retired Proofing nav item: once a file is linked,
  // whether a comparison can start comes from the `review` capability, so a REAPER that is not connected says so.
  it('gates Start comparison on the review capability when REAPER is not connected', async () => {
    render(
      <ApiProvider api={createMockApi({}, { daw: { connected: false } })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Start comparison/ }).getAttribute('aria-disabled')).toBe('true'));
    // The reason is the button's description and, in sight, beside it (alignment audit XPC-15).
    expect(screen.getAllByText(/REAPER is not connected to this app/)).toHaveLength(2);
  });

  it('disables marker export without a linked DAW file, and for the last comparison under review', () => {
    const results = {
      ...WIRE_TRANSCRIPT,
      phase: 'success' as const,
      rows: WIRE_DISCREPANCIES,
      markerExport: { phase: 'idle' as const, message: '', added: 0, skipped: 0 },
    };
    const { rerender } = render(
      <ApiProvider api={createMockApi()}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={results}
          notify={vi.fn()}
          dawFileLinked={false}
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={2}
        />
      </ApiProvider>,
    );
    expect((screen.getByRole('button', { name: /Export/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <ApiProvider api={createMockApi()}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          lastCompleted={results}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={2}
        />
      </ApiProvider>,
    );
    expect((screen.getByRole('button', { name: /Export/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CompareRun chapter choice', () => {
  it('asks which chapter the track belongs to in a named region inside the run', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'need_chapter', chapters: ['Chapter 1', 'Chapter 2'] }}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    expect(screen.getByRole('region', { name: 'Compare the recording with the script' })).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Choose manuscript chapter' });
    expect(within(region).getByRole('heading', { level: 2 })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Chapter 2' })).toBeTruthy();
  });
});

describe('CompareRun vocabulary suggestions', () => {
  it('does not show candidates until requested, then accepts manifest candidates once', async () => {
    const api = createMockApi();
    render(
      <ApiProvider api={api}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    await screen.findByText('Vocabulary hints');
    expect(screen.queryByRole('button', { name: /\+ Alice/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Suggest from manuscript/ }));
    const alice = await screen.findByRole('button', { name: /\+ Alice/ });
    fireEvent.click(alice);
    await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Suggest from manuscript/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /\+ Alice/ })).toBeNull());
  });

  it('says how many discrepancies this chapter has and exports only pending markers on explicit request', async () => {
    const exportMarkers = vi.fn().mockResolvedValue(undefined);
    const api = createMockApi({ transcriptExportMarkers: exportMarkers });
    render(
      <ApiProvider api={api}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'success', rows: WIRE_DISCREPANCIES, markerExport: { phase: 'idle', message: '', added: 0, skipped: 0 } }}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={2}
        />
      </ApiProvider>,
    );

    expect(screen.getByText(/2 discrepancies in Chapter 1 \(1 more in other chapters\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export 1 marker' }));
    await waitFor(() => expect(exportMarkers).toHaveBeenCalledOnce());
  });

  it('New comparison resets a live run, and only closes the last comparison under review', async () => {
    const transcriptReset = vi.fn().mockResolvedValue(undefined);
    const onCloseLast = vi.fn();
    const results = { ...WIRE_TRANSCRIPT, phase: 'success' as const, rows: WIRE_DISCREPANCIES };
    const { rerender } = render(
      <ApiProvider api={createMockApi({ transcriptReset })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={results}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={onCloseLast}
          foundHere={2}
        />
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New comparison' }));
    await waitFor(() => expect(transcriptReset).toHaveBeenCalledOnce());

    rerender(
      <ApiProvider api={createMockApi({ transcriptReset })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          lastCompleted={results}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast
          onReviewLast={vi.fn()}
          onCloseLast={onCloseLast}
          foundHere={2}
        />
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New comparison' }));
    expect(onCloseLast).toHaveBeenCalledOnce();
    expect(transcriptReset).toHaveBeenCalledOnce();
  });

  it('gates on the approved Whisper model, installs it, then starts the comparison', async () => {
    const transcriptStart = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'asset_required',
        model: {
          id: 'small',
          provider: 'faster-whisper',
          displayName: 'Small',
          version: '1',
          publisher: 'Systran',
          license: 'MIT',
          licenseUrl: 'https://example.invalid',
          modelCardUrl: '',
          provenanceUrl: '',
          attribution: '',
        },
        installState: 'not_installed',
        downloadSize: 483546902,
      })
      .mockResolvedValueOnce({ status: 'started' });
    const whisperInstall = vi.fn().mockResolvedValue({
      id: 'w-1',
      modelId: 'small',
      phase: 'success',
      message: 'Whisper model installed and verified.',
      percent: 100,
      bytesDone: 10,
      bytesTotal: 10,
      error: '',
    });
    const api = createMockApi({ transcriptStart, whisperInstall });
    render(
      <ApiProvider api={api}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Start comparison/ }));
    await screen.findByText('Download local Whisper model?');
    fireEvent.click(screen.getByRole('button', { name: 'Download model' }));

    await waitFor(() => expect(whisperInstall).toHaveBeenCalledWith('small'));
    await waitFor(() => expect(transcriptStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Download local Whisper model?')).toBeNull());
  });
});

describe('CompareRun "may have changed since comparison"', () => {
  const resultsProps = (overrides: Partial<Parameters<typeof CompareRun>[0]> = {}) => ({
    chapterTitle: 'Chapter 1',
    state: { ...WIRE_TRANSCRIPT, phase: 'success' as const, rows: WIRE_DISCREPANCIES, projectChangeCount: 41 },
    notify: vi.fn(),
    dawFileLinked: true,
    reviewingLast: false,
    onReviewLast: vi.fn(),
    onCloseLast: vi.fn(),
    foundHere: 2,
    ...overrides,
  });

  it('shows the label once a background check finds REAPER’s count has moved past the comparison’s baseline', async () => {
    render(
      <ApiProvider api={createMockApi()}>
        <CompareRun {...resultsProps()} />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByText('The REAPER project may have changed since this comparison.')).toBeTruthy());
  });

  it('says nothing when the checked count still matches the comparison’s baseline', async () => {
    render(
      <ApiProvider api={createMockApi({}, { projectState: 'unchanged' })}>
        <CompareRun {...resultsProps()} />
      </ApiProvider>,
    );
    await screen.findByText(/2 discrepancies/);
    expect(screen.queryByText(/may have changed/)).toBeNull();
  });

  it('says nothing when the mock DAW reports the count the comparison started from (one counter for the comparison, the check and the DAW)', async () => {
    render(
      <ApiProvider api={createMockApi({}, { projectState: 'unchanged' })}>
        <CompareRun {...resultsProps()} />
      </ApiProvider>,
    );
    await screen.findByText(/2 discrepancies/);
    act(() => (window.__NARRATION_MOCK_DAW__ as { reportProjectCount(): void }).reportProjectCount());
    await act(async () => {});
    expect(screen.queryByText(/may have changed/)).toBeNull();
  });

  it('never checks, and never shows the label, when the comparison carries no baseline count', async () => {
    const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
    render(
      <ApiProvider api={createMockApi({ projectStateCheck })}>
        <CompareRun {...resultsProps({ state: { ...WIRE_TRANSCRIPT, phase: 'success', rows: WIRE_DISCREPANCIES, projectChangeCount: undefined } })} />
      </ApiProvider>,
    );
    await screen.findByText(/2 discrepancies/);
    expect(projectStateCheck).not.toHaveBeenCalled();
    expect(screen.queryByText(/may have changed/)).toBeNull();
  });

  it('says nothing outside the results view, even with a baseline on the run', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <CompareRun {...resultsProps({ state: { ...WIRE_TRANSCRIPT, phase: 'idle', projectChangeCount: 41 } })} />
      </ApiProvider>,
    );
    expect(screen.queryByText(/may have changed/)).toBeNull();
  });

  it('checks the last completed comparison’s baseline while reviewing it, not the idle live state', async () => {
    const results = { ...WIRE_TRANSCRIPT, phase: 'success' as const, rows: WIRE_DISCREPANCIES, projectChangeCount: 41 };
    render(
      <ApiProvider api={createMockApi()}>
        <CompareRun {...resultsProps({ state: WIRE_TRANSCRIPT, lastCompleted: results, reviewingLast: true })} />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByText('The REAPER project may have changed since this comparison.')).toBeTruthy());
  });

  describe('hears the edits instead of asking every 30 s', () => {
    const quietApi = () => {
      let emit: (edit: { changeCount: number }) => void = () => {};
      const off = vi.fn();
      const subscribeDawProjectEdited = vi.fn((listener: typeof emit) => ((emit = listener), off));
      const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
      const projectStateChangedSince = vi.fn(async (current: number, baseline: number) => ({ changed: current !== baseline }));
      return {
        api: createMockApi({ subscribeDawProjectEdited, projectStateCheck, projectStateChangedSince } as never),
        emit: (edit: { changeCount: number }) => emit(edit),
        off,
        projectStateCheck,
        projectStateChangedSince,
      };
    };

    it('an edit the host announces shows the label at once, with no read of REAPER', async () => {
      const { api, emit, projectStateCheck, projectStateChangedSince } = quietApi();
      render(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps()} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      const reads = projectStateCheck.mock.calls.length;
      expect(screen.queryByText(/may have changed/)).toBeNull();
      act(() => emit({ changeCount: 44 }));
      await waitFor(() => expect(screen.getByText('The REAPER project may have changed since this comparison.')).toBeTruthy());
      expect(projectStateChangedSince).toHaveBeenCalledWith(44, 41);
      expect(projectStateCheck.mock.calls.length).toBe(reads);
    });

    it('an announcement of the comparison’s own count says nothing, and a later edit shows the label', async () => {
      const { api, emit } = quietApi();
      render(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps()} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      act(() => emit({ changeCount: 41 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByText(/may have changed/)).toBeNull();
      act(() => emit({ changeCount: 42 }));
      await waitFor(() => expect(screen.getByText(/may have changed/)).toBeTruthy());
    });

    it('listens only while results are shown: when they close, an edit is not compared and no note shows', async () => {
      let listener: (edit: { changeCount: number }) => void = () => {};
      const off = vi.fn(() => {
        listener = () => {};
      });
      const subscribeDawProjectEdited = vi.fn((next: typeof listener) => ((listener = next), off));
      const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
      const projectStateChangedSince = vi.fn(async (current: number, baseline: number) => ({ changed: current !== baseline }));
      const api = createMockApi({ subscribeDawProjectEdited, projectStateCheck, projectStateChangedSince } as never);
      const view = render(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps()} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      const heard = listener;
      view.rerender(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps({ state: { ...WIRE_TRANSCRIPT, phase: 'idle', projectChangeCount: 41 } })} />
        </ApiProvider>,
      );
      expect(off).toHaveBeenCalled();
      const compared = projectStateChangedSince.mock.calls.length;
      // The listener that was heard before the results closed is ignored, and so is any later one.
      act(() => heard({ changeCount: 50 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(projectStateChangedSince.mock.calls.length).toBe(compared);
      expect(screen.queryByText(/may have changed/)).toBeNull();
    });

    // The mock host answers each check with its own state (what the real one does when REAPER answers); the spy counts the asks.
    const asked = () => {
      const api = createMockApi();
      return { api, projectStateCheck: vi.spyOn(api, 'projectStateCheck') };
    };
    const results = () => <CompareRun {...resultsProps()} />;
    const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    it('a check that fails is asked again soon, not left to the backstop, because the edits made earlier are not announced again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { api, projectStateCheck } = asked();
        projectStateCheck.mockRejectedValueOnce(new Error('REAPER is not answering'));
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(5_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
        // The retry was answered: nothing more is asked before the backstop.
        await advance(60_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a check that keeps failing is asked again at 5 s and 30 s, then only on the backstop', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { api, projectStateCheck } = asked();
        projectStateCheck.mockRejectedValue(new Error('REAPER is not answering'));
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(5_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
        await advance(30_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(3);
        await advance(200_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(3);
        await advance(70_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });

    // A host whose project-state surface is driven by the test: `replay` is the state it hands a new subscriber, `check` what an ask does.
    const hostWith = (replay: unknown | undefined, check: (publish: (state: unknown) => void) => Promise<{ status: 'started' }>) => {
      const listeners = new Set<(state: unknown) => void>();
      const publish = (state: unknown) => listeners.forEach((listener) => listener(state));
      const projectStateCheck = vi.fn(() => check(publish));
      const subscribeProjectState = vi.fn((listener: (state: unknown) => void) => {
        listeners.add(listener);
        if (replay !== undefined) listener(replay);
        return () => listeners.delete(listener);
      });
      return { api: { ...createMockApi(), projectStateCheck, subscribeProjectState } as never, projectStateCheck };
    };
    const state = (phase: string, changeCount: number | null = null) => ({
      runId: 'r',
      phase,
      message: '',
      changeCount,
      projectFile: '',
      savedModifiedAt: null,
    });

    it('a failure the host reports twice (an error state and a rejected call) is one failure: the retries are 5 s and 30 s, not both used at once', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { api, projectStateCheck } = hostWith(undefined, async (publish) => {
          publish(state('error'));
          throw new Error('the REAPER bridge is unavailable');
        });
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(5_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
        await advance(30_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('an old error the state replays on subscribe does not use up a retry, and an old count it replays is not shown', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        // The state from an earlier opening says error; a count of 99 would be "changed" against 41.
        const { api, projectStateCheck } = hostWith(state('error'), async () => {
          throw new Error('the REAPER bridge is unavailable');
        });
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(5_100);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('an old count the state replays on subscribe is not this opening’s answer: no note until its own check answers', async () => {
      const { api } = hostWith(state('success', 99), async () => ({ status: 'started' as const }));
      render(<ApiProvider api={api}>{results()}</ApiProvider>);
      await screen.findByText(/2 discrepancies/);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByText(/may have changed/)).toBeNull();
    });

    it('a late answer ends the wait: the retry it queued is cancelled, and a slow REAPER is not asked again and again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        // The answer comes 21 s after the ask: after the 20 s mark queued a retry, before it fires.
        const { api, projectStateCheck } = hostWith(undefined, async (publish) => {
          setTimeout(() => publish(state('success', 41)), 21_000);
          return { status: 'started' as const };
        });
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        await advance(21_500);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(120_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('the newest comparison asked is the one that counts, whichever finishes first', async () => {
      const deferred: Array<(result: { changed: boolean }) => void> = [];
      let emit: (edit: { changeCount: number }) => void = () => {};
      const subscribeDawProjectEdited = vi.fn((listener: typeof emit) => ((emit = listener), () => {}));
      const projectStateChangedSince = vi.fn(() => new Promise<{ changed: boolean }>((resolve) => deferred.push(resolve)));
      const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
      const api = createMockApi({ subscribeDawProjectEdited, projectStateChangedSince, projectStateCheck } as never);
      render(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps()} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      act(() => emit({ changeCount: 43 }));
      act(() => emit({ changeCount: 44 }));
      expect(deferred.length).toBe(2);
      // The newer comparison (44, changed) is answered first, then the older (43, unchanged): the older does not undo it.
      await act(async () => deferred[1]!({ changed: true }));
      await act(async () => deferred[0]!({ changed: false }));
      expect(screen.queryByText(/may have changed/)).not.toBeNull();
    });

    it('an older count heard after a newer one does not clear the note', async () => {
      let emit: (edit: { changeCount: number }) => void = () => {};
      const subscribeDawProjectEdited = vi.fn((listener: typeof emit) => ((emit = listener), () => {}));
      const projectStateChangedSince = vi.fn(async (current: number, baseline: number) => ({ changed: current !== baseline }));
      const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
      const api = createMockApi({ subscribeDawProjectEdited, projectStateChangedSince, projectStateCheck } as never);
      render(
        <ApiProvider api={api}>
          <CompareRun {...resultsProps()} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      // An edit made the count 42: the note shows. A count of 41 heard after it was read before that edit, so it is stale.
      act(() => emit({ changeCount: 42 }));
      expect(await screen.findByText(/may have changed/)).toBeTruthy();
      act(() => emit({ changeCount: 41 }));
      await act(async () => {});
      expect(screen.queryByText(/may have changed/)).not.toBeNull();
      expect(projectStateChangedSince).not.toHaveBeenCalledWith(41, 41);
    });

    it('a check REAPER never answers is treated as failed after 20 s and asked again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        // The ask is accepted and nothing is ever published.
        const projectStateCheck = vi.fn().mockResolvedValue({ status: 'started' as const });
        const api = createMockApi({ projectStateCheck } as never);
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(19_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(7_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('the note of an earlier baseline is cleared when the results switch to another comparison, until its count is known', async () => {
      const results = (count: number) => ({ ...WIRE_TRANSCRIPT, phase: 'success' as const, rows: WIRE_DISCREPANCIES, projectChangeCount: count });
      const view = render(
        <ApiProvider api={createMockApi()}>
          <CompareRun {...resultsProps({ state: results(41) })} />
        </ApiProvider>,
      );
      await waitFor(() => expect(screen.getByText(/may have changed/)).toBeTruthy());
      const quiet = createMockApi({ projectStateCheck: vi.fn().mockRejectedValue(new Error('x')) } as never);
      view.rerender(
        <ApiProvider api={quiet}>
          <CompareRun {...resultsProps({ state: results(7) })} />
        </ApiProvider>,
      );
      await screen.findByText(/2 discrepancies/);
      expect(screen.queryByText(/may have changed/)).toBeNull();
    });

    it('asks REAPER once when the results open, then only on a slow backstop, not every 30 s', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { api, projectStateCheck } = asked();
        render(<ApiProvider api={api}>{results()}</ApiProvider>);
        await screen.findByText(/2 discrepancies/);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(120_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(1);
        await advance(181_000);
        expect(projectStateCheck).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('a failed check is quiet: no label, no crash', async () => {
    render(
      <ApiProvider api={createMockApi({}, { projectState: 'error' })}>
        <CompareRun {...resultsProps()} />
      </ApiProvider>,
    );
    await screen.findByText(/2 discrepancies/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/may have changed/)).toBeNull();
  });
});

describe('CompareRun vocabulary hints feedback', () => {
  function renderHints(overrides: Parameters<typeof createMockApi>[0] = {}) {
    const notify = vi.fn();
    const api = createMockApi(overrides);
    render(
      <ApiProvider api={api}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={WIRE_TRANSCRIPT}
          notify={notify}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    return notify;
  }
  const suggest = () => fireEvent.click(screen.getByRole('button', { name: /Suggest from manuscript/ }));

  it('says nothing was found when the Story Bible offers no names', async () => {
    const notify = renderHints({ transcriptSuggestHints: async () => ({ terms: [], found: 0 }) });
    await screen.findByText('Vocabulary hints');

    suggest();

    await waitFor(() => expect(notify).toHaveBeenCalledWith('No names found in the Story Bible yet. Build it or add entries, then try again.'));
  });

  it('says everything found is already accepted, and how many that is', async () => {
    const notify = renderHints({ transcriptSuggestHints: async () => ({ terms: [], found: 3 }) });
    await screen.findByText('Vocabulary hints');

    suggest();

    await waitFor(() => expect(notify).toHaveBeenCalledWith('No new suggestions: all 3 names found are already accepted.'));
  });

  it('counts the new suggestions, and says so when a second click finds only ones already shown', async () => {
    const notify = renderHints({ transcriptSuggestHints: async () => ({ terms: ['Alice', 'Zeph'], found: 2 }) });
    await screen.findByText('Vocabulary hints');

    suggest();
    await waitFor(() => expect(notify).toHaveBeenLastCalledWith('Found 2 new suggestions.'));
    suggest();

    await waitFor(() => expect(notify).toHaveBeenLastCalledWith('The 2 suggestions found are already shown. Click one to accept it.'));
    expect(screen.getAllByRole('button', { name: /^\+ / })).toHaveLength(2);
  });

  it('matches suggestions against accepted hints regardless of case', async () => {
    const notify = renderHints({ transcriptHints: async () => ['alice'], transcriptSuggestHints: async () => ({ terms: ['Alice', 'Zeph'], found: 2 }) });
    await screen.findByText('alice');

    suggest();

    await waitFor(() => expect(notify).toHaveBeenLastCalledWith('Found 1 new suggestion.'));
    expect(screen.queryByRole('button', { name: '+ Alice' })).toBeNull();
    expect(screen.getByRole('button', { name: '+ Zeph' })).toBeTruthy();
  });

  it('reports the host reason when Suggest fails', async () => {
    const notify = renderHints({ transcriptSuggestHints: () => Promise.reject('build the Story Bible before requesting vocabulary suggestions') });
    await screen.findByText('Vocabulary hints');

    suggest();

    await waitFor(() => expect(notify).toHaveBeenCalledWith('build the Story Bible before requesting vocabulary suggestions', 'error'));
  });

  it('says when the saved hints could not be loaded instead of showing an empty box', async () => {
    const notify = renderHints({ transcriptHints: () => Promise.reject('the saved vocabulary hints file is not a valid list') });

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'The saved vocabulary hints could not be loaded: the saved vocabulary hints file is not a valid list. Hints you add now will replace them.',
        'error',
        expect.objectContaining({ label: 'Retry' }),
      ),
    );
    expect(screen.getByText('Vocabulary hints')).toBeTruthy();
  });

  // Issue #2919: reading the saved hints changes nothing, so Retry reads them again.
  it('Retry on the failed hints load reads the saved hints again', async () => {
    const transcriptHints = vi.fn().mockRejectedValueOnce('the saved vocabulary hints file is not a valid list').mockResolvedValue([]);
    const notify = renderHints({ transcriptHints });
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('could not be loaded'), 'error', expect.objectContaining({ label: 'Retry' })),
    );
    notify.mock.calls.find((call) => call[1] === 'error')![2].onAction();
    await waitFor(() => expect(transcriptHints).toHaveBeenCalledTimes(2));
  });

  it('adds a typed term once, whatever its case', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHints({ transcriptHints: async () => ['Alice'], transcriptSaveHints: save });
    await screen.findByText('Alice');

    const input = screen.getByPlaceholderText('Add a term…');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Zeph' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(['Alice', 'Zeph']);
  });

  it('does not offer a name accepted while the suggestion request was still in flight', async () => {
    let resolveSuggest: (value: { terms: string[]; found: number }) => void = () => {};
    const save = vi.fn().mockResolvedValue(undefined);
    const notify = renderHints({
      transcriptSaveHints: save,
      transcriptSuggestHints: () => new Promise((resolve) => (resolveSuggest = resolve)),
    });
    await screen.findByText('Vocabulary hints');

    suggest();
    const input = screen.getByPlaceholderText('Add a term…');
    fireEvent.change(input, { target: { value: 'Alice' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(save).toHaveBeenCalledWith(['Alice']));
    await act(async () => resolveSuggest({ terms: ['Alice', 'Zeph'], found: 2 }));

    expect(screen.queryByRole('button', { name: '+ Alice' })).toBeNull();
    expect(screen.getByRole('button', { name: '+ Zeph' })).toBeTruthy();
    expect(notify).toHaveBeenLastCalledWith('Found 1 new suggestion.');
  });

  it('loads the saved hints once and reports a load failure once', async () => {
    const hints = vi.fn().mockRejectedValue('the saved vocabulary hints file is not a valid list');
    const notify = renderHints({ transcriptHints: hints });

    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(hints).toHaveBeenCalledTimes(1);
  });

  it('splits a typed or pasted list on commas so no term can hold one', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHints({ transcriptSaveHints: save });
    await screen.findByText('Vocabulary hints');

    const input = screen.getByPlaceholderText('Add a term…');
    fireEvent.change(input, { target: { value: ' Juno,  Zeph , ,juno ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(save).toHaveBeenCalledWith(['Juno', 'Zeph']));
  });
});

describe('the running phase progress bar', () => {
  it('is the real ProgressBar primitive, named and announcing its value, not a hand-drawn div', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'running', percent: 63 }}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    const bar = screen.getByRole('progressbar', { name: 'Comparison progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('63');
  });
});

describe('CompareRun for an Audacity project', () => {
  it('words the setup, the gate and the export for Audacity, never REAPER', async () => {
    const props = {
      chapterTitle: 'Chapter 1',
      state: WIRE_TRANSCRIPT,
      notify: vi.fn(),
      reviewingLast: false,
      onReviewLast: vi.fn(),
      onCloseLast: vi.fn(),
      foundHere: 0,
    };
    render(
      <ApiProvider api={createMockApi({}, { daw: { daw: 'Audacity' } })}>
        <CompareRun {...props} dawFileLinked={false} />
      </ApiProvider>,
    );
    expect(await screen.findAllByText(/Link the Audacity project to start a comparison/)).toHaveLength(2);
    // The reason is the button's description and, in sight, beside it (alignment audit XPC-15); the setup draws no intro sentence.
    expect(screen.queryByText(/Transcribes the/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/REAPER/);
  });
});

describe('CompareRun starting values from Settings', () => {
  it('starts on the longest chunk the stored model allows, never on one it disables', async () => {
    const field = (key: string, effectiveValue: string) => ({ key, effectiveValue }) as never;
    const settingsForScope = vi.fn().mockResolvedValue({ TranscriptCompare: [field('model_size', 'large-v3'), field('chunk_seconds', '600')] });
    render(
      <ApiProvider api={createMockApi({ settingsForScope })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'idle' }}
          notify={vi.fn()}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    const group = await screen.findByRole('group', { name: 'Chunk length' });
    await waitFor(() => expect(settingsForScope).toHaveBeenCalled());
    await waitFor(() => {
      const chosen = within(group)
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true');
      expect(chosen.map((button) => button.textContent)).toEqual(['60 s']);
    });
  });

  it('says so when the stored chunk is not one of its choices, instead of silently starting on 60 s', async () => {
    const field = (key: string, effectiveValue: string) => ({ key, effectiveValue }) as never;
    const settingsForScope = vi.fn().mockResolvedValue({ TranscriptCompare: [field('chunk_seconds', 'abc')] });
    const notify = vi.fn();
    render(
      <ApiProvider api={createMockApi({ settingsForScope })}>
        <CompareRun
          chapterTitle="Chapter 1"
          state={{ ...WIRE_TRANSCRIPT, phase: 'idle' }}
          notify={notify}
          dawFileLinked
          reviewingLast={false}
          onReviewLast={vi.fn()}
          onCloseLast={vi.fn()}
          foundHere={0}
        />
      </ApiProvider>,
    );
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining(', abc (invalid), is not one this panel offers; starting on 60 s')));
  });
});
