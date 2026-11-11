// @vitest-environment jsdom
// #3320: the host has ONE listening session and one DAW take, and a press's continuation (its listening start, its stop, its late answer) acts on them.
// Each of these runs the real page against a host that behaves as the real one does (one session at a time; a second start while one runs is
// refused; a stop ends whatever runs) and holds the answers a test names, so a press that outlived its Booth shows what it does to the next one.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { endListeningClaims } from '../listening/listeningClaims';
import { PRESS_LIMITS_MS } from '../record/pressLimits';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => {
  forgetAppTake();
  endListeningClaims();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
const SCRIPT: TeleprompterEvent = {
  type: 'script',
  chapter: { id: 'c1', title: 'Chapter One' },
  tokens: 36,
  spans: [
    { kind: 'title', id: 'c1', index: null, start: 0, count: 2 },
    { kind: 'paragraph', id: 'p1', index: 0, start: 2, count: 11 },
    { kind: 'paragraph', id: 'p2', index: 1, start: 13, count: 13 },
    { kind: 'paragraph', id: 'p3', index: 2, start: 26, count: 10 },
  ],
};

/**
 * The host's one session. A start while a session runs is refused as the real host does; a stop ends whatever runs, whoever asked. Each start takes
 * the next gate a test queued (`holdNextStart`), so its answer comes when the test says.
 */
function fakeHost() {
  let state: TeleprompterState = IDLE;
  const states = new Set<(next: TeleprompterState) => void>();
  const events = new Set<(event: TeleprompterEvent) => void>();
  const gates: Array<Promise<void>> = [];
  const publish = (next: Partial<TeleprompterState>) => {
    state = { ...state, ...next };
    states.forEach((listener) => listener(state));
  };
  const teleprompterStart = vi.fn(async (options: TeleprompterStartOptions) => {
    if (state.phase === 'starting' || state.phase === 'running') throw new Error('a teleprompter session is already running');
    publish({ phase: 'starting', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead), position: null });
    await gates.shift();
    // A stop that came while the session was starting ends it: the start fails, as the real host's does.
    if ((state.phase as string) !== 'starting') throw new Error('the session was stopped while it started');
    publish({ phase: 'running' });
    events.forEach((listener) => listener(SCRIPT));
    return { status: 'started' as const };
  });
  const teleprompterStop = vi.fn(async () => {
    if (state.phase === 'starting' || state.phase === 'running') publish({ phase: 'stopped' });
  });
  const api: Partial<NarrationApi> = {
    teleprompterStart,
    teleprompterStop,
    teleprompterSaveFlags: vi.fn(async () => []),
    teleprompterState: async () => state,
    subscribeTeleprompterState: (listener) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    subscribeTeleprompterEvent: (listener) => {
      events.add(listener);
      return () => events.delete(listener);
    },
  };
  return {
    api,
    teleprompterStart,
    teleprompterStop,
    phase: () => state.phase,
    /** The next start does not answer until the returned function is called. */
    holdNextStart: () => {
      let release = () => {};
      gates.push(new Promise<void>((resolve) => (release = resolve)));
      return () => act(async () => release());
    },
  };
}

/** One Booth mount over the host and DAW; a second call is the narrator coming back to the Booth. */
function mountBooth(host: ReturnType<typeof fakeHost>, daw = dawFor('reaper'), over: Partial<NarrationApi> = {}) {
  const recordStart = vi.spyOn(daw, 'recordStart');
  const recordStop = vi.spyOn(daw, 'recordStop');
  const undoLast = vi.spyOn(daw, 'undoLast');
  const overlay = createOverlayService();
  const api = pageApi({ passageMapRecordRun: async () => {}, ...host.api, ...over } as Partial<NarrationApi>);
  const view = render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  return { view, daw, recordStart, recordStop, undoLast, overlay };
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const space = () =>
  act(() => {
    skipStartGuard();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
  });
const main = () => document.getElementById('brec') as HTMLButtonElement;
const chooseCold = async () => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Record options' })));
  const group = await screen.findByRole('radiogroup', { name: 'Main button' });
  await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Cold read' })));
  await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Main button' })).toBeNull());
};
const refused = async () => ({
  ok: false,
  changed: false,
  message: 'REAPER is playing: stop it first.',
  refused: 'REAPER is playing: stop it first.',
  undoSteps: 0,
});

describe('a press that outlived its Booth does not end the listening of the Booth after it', () => {
  it('a refused press 1 answered late (listening up) cannot stop the listening press 2 joined after the narrator came back', async () => {
    const host = fakeHost();
    const releaseFirst = host.holdNextStart();
    const first = mountBooth(host);
    first.recordStart.mockImplementationOnce(refused);
    await ready();
    await space();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    // The narrator leaves and comes back while press 1's listening is still starting: the host session is there for the new Booth to join.
    first.view.unmount();
    const second = mountBooth(host);
    await ready();
    await space();
    await waitFor(() => expect(second.recordStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await releaseFirst();
    await settle();
    // Press 1 was cancelled: press 2 joined its session, so the session is press 2's now.
    expect(host.teleprompterStop).not.toHaveBeenCalled();
    expect(host.phase()).toBe('running');
  });

  it('press 1 cancelled, press 2 joined and is refused: press 2 lets the session go (nobody else will)', async () => {
    const host = fakeHost();
    const releaseFirst = host.holdNextStart();
    const first = mountBooth(host);
    first.recordStart.mockImplementationOnce(refused);
    await ready();
    await space();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    first.view.unmount();
    const second = mountBooth(host);
    second.recordStart.mockImplementationOnce(refused);
    await ready();
    await space();
    await waitFor(() => expect(second.recordStart).toHaveBeenCalledTimes(1));
    await releaseFirst();
    await settle();
    await waitFor(() => expect(host.phase()).not.toBe('running'));
    expect(host.teleprompterStop).toHaveBeenCalledTimes(1);
  });

  it('a late old Booth start does not stop the take the new Booth started', async () => {
    const host = fakeHost();
    const first = mountBooth(host);
    let answerFirst = (_value: Awaited<ReturnType<typeof first.daw.recordStart>>) => {};
    first.recordStart.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    await ready();
    await space();
    await waitFor(() => expect(first.recordStart).toHaveBeenCalledTimes(1));
    first.view.unmount();
    const second = mountBooth(host, first.daw);
    await ready();
    await space();
    await waitFor(() => expect(second.recordStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await act(async () => answerFirst({ ok: true, changed: true, message: '', undoSteps: 0 } as never));
    await settle();
    expect(first.recordStop).not.toHaveBeenCalled();
    expect(host.teleprompterStop).not.toHaveBeenCalled();
    expect(host.phase()).toBe('running');
  });
});

describe('a cold read the narrator left is not left listening', () => {
  it('leaving during the cold read model check starts nothing when the check answers', async () => {
    const host = fakeHost();
    let answer = (_list: unknown) => {};
    const assetsList = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const page = mountBooth(host, undefined, { assetsList: assetsList as never });
    await ready();
    await chooseCold();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(assetsList).toHaveBeenCalled());
    page.view.unmount();
    await act(async () => answer({ cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] }));
    await settle();
    expect(host.teleprompterStart).not.toHaveBeenCalled();
  });

  it('leaving while the cold read start is out lets the session go when it answers', async () => {
    const host = fakeHost();
    const release = host.holdNextStart();
    const page = mountBooth(host);
    await ready();
    await chooseCold();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    page.view.unmount();
    await release();
    await settle();
    await waitFor(() => expect(host.phase()).not.toBe('running'));
  });
});

describe('the stop of a take whose listening failed has a limit', () => {
  it('a stop the DAW never answers ends the press at its limit with the stop sentence, and Record is free', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      host.api.teleprompterStart = vi.fn(async () => {
        throw new Error('The microphone is in use by another application.');
      });
      const page = mountBooth(host);
      page.recordStop.mockImplementation(() => new Promise(() => {}));
      await ready();
      await space();
      await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStop + 5));
      await screen.findByText(/The recording could not be stopped: the stop did not answer in time\. Stop it in REAPER\./);
      await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
      expect(page.undoLast).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
