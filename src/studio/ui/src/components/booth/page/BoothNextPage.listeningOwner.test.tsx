// @vitest-environment jsdom
// #3320: the host has ONE listening session and one DAW take, and a press's continuation (its listening start, its stop, its late answer) acts on them.
// Each of these runs the real page against a host that behaves as the real one does (one session at a time; a second start while one runs is
// refused; a stop ends whatever runs) and holds the answers a test names, so a press that outlived its Booth shows what it does to the next one.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../../../api/uiLog', () => ({ logUi: vi.fn() }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { logUi } from '../../../api/uiLog';
import { PRESS_LIMITS_MS } from '../record/pressLimits';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { claimListening, forgetListeningClaims, joinListening, unclaimListening } from '../listening/listeningClaims';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => {
  forgetAppTake();
  forgetListeningClaims();
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
function fakeHost({ stopEndsStarting = true, ignoreStopWhileStarting = false }: { stopEndsStarting?: boolean; ignoreStopWhileStarting?: boolean } = {}) {
  let state: TeleprompterState = IDLE;
  const states = new Set<(next: TeleprompterState) => void>();
  const events = new Set<(event: TeleprompterEvent) => void>();
  const gates: Array<Promise<void>> = [];
  // How a held start ends: `answer` resolves it as started, `refuse` makes it fail as the host's does (the phase goes to error).
  let muted = false;
  let holdStop = false;
  let quietFailure = false;
  const publish = (next: Partial<TeleprompterState>) => {
    state = { ...state, ...next };
    if (!muted) states.forEach((listener) => listener(state));
  };
  const teleprompterStart = vi.fn(async (options: TeleprompterStartOptions) => {
    if (state.phase === 'starting' || state.phase === 'running' || state.phase === 'stopping') throw new Error('a teleprompter session is already running');
    publish({ phase: 'starting', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead), position: null });
    try {
      await gates.shift();
    } catch (reason) {
      if (!quietFailure) publish({ phase: 'error', message: 'the microphone is in use' });
      throw reason;
    }
    // A stop that came while the session was starting ends it: the start fails, as the real host's does.
    if (stopEndsStarting && (state.phase as string) !== 'starting') throw new Error('the session was stopped while it started');
    publish({ phase: 'running' });
    events.forEach((listener) => listener(SCRIPT));
    return { status: 'started' as const };
  });
  const teleprompterStop = vi.fn(async () => {
    // The real host returns at once when the session has no child process yet (service.go): the stop answers OK and the session then comes up.
    if (ignoreStopWhileStarting && state.phase === 'starting') return;
    if (state.phase === 'starting' || state.phase === 'running') publish({ phase: holdStop ? 'stopping' : 'stopped' });
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
    /** The host's pushes stop reaching the page (a lost event); the state it reads still tells. */
    muteEvents: () => void (muted = true),
    /** A stop says `stopping` and ends only at `finishStop`, as a sidecar still decoding what it heard does. */
    holdStops: () => void (holdStop = true),
    finishStop: () => act(async () => void publish({ phase: 'stopped' })),
    listenerCount: () => states.size,
    /** A held start that is refused leaves the phase as it was (another page's session may be up), as when the host belongs to a later start. */
    quietFailures: () => void (quietFailure = true),
    /** The host's session is up, as a start made by a later page would leave it. */
    forceRunning: () => act(async () => void publish({ phase: 'running' })),
    /** A cold read is up on the host, as one the narrator started on this page would be. */
    forceColdRunning: () => act(async () => void publish({ phase: 'running', coldRead: true })),
    /** The host reads idle, as when the session a page would have joined is gone. */
    forceIdle: () => act(async () => void publish({ phase: 'idle' })),
    /** The next start does not answer until the returned function is called. */
    holdNextStart: () => {
      let release = () => {};
      let fail = () => {};
      gates.push(new Promise<void>((resolve, reject) => ((release = resolve), (fail = () => reject(new Error('the microphone is in use'))))));
      const answer = () => act(async () => release());
      return Object.assign(answer, {
        refuse: () => act(async () => fail()),
        /** The host reads idle and the start is refused in the same turn, as a host whose phase push and reply arrive together. */
        refuseIdle: () =>
          act(async () => {
            publish({ phase: 'idle' });
            fail();
          }),
      });
    },
  };
}

/** The router from inside it: a chapter change, as a link elsewhere in the app would make it. */
const driver = { go: (_to: string): void => undefined };
function Driver() {
  const navigateTo = useNavigate();
  driver.go = (to) => void navigateTo(to);
  return null;
}

/** One Booth mount over the host and DAW; a second call is the narrator coming back to the Booth. */
function mountBooth(host: ReturnType<typeof fakeHost>, daw = dawFor('reaper'), over: Partial<NarrationApi> = {}, search?: string) {
  const recordStart = vi.spyOn(daw, 'recordStart');
  const recordStop = vi.spyOn(daw, 'recordStop');
  const undoLast = vi.spyOn(daw, 'undoLast');
  const overlay = createOverlayService();
  const api = pageApi({ passageMapRecordRun: async () => {}, ...host.api, ...over } as Partial<NarrationApi>);
  const view = render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay} search={search}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
      <Driver />
    </BoothHost>,
  );
  return { view, daw, recordStart, recordStop, undoLast, overlay };
}

// Longer than the session hook's wait for a stop (STOP_WAIT_MS).
const STOP_WAIT_FOR_TEST = 12_000;

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

describe('the narrator ends a cold read while a newer claim sits over its own', () => {
  it('leaves no claim behind for the session that ended', async () => {
    const host = fakeHost();
    mountBooth(host);
    await ready();
    await chooseCold();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(host.phase()).toBe('running'));
    // A press from a Booth that was left claims after the cold read did, so the cold read's claim is no longer the newest.
    const newer = claimListening();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(host.phase()).not.toBe('running'));
    unclaimListening(newer);
    expect(joinListening(), 'the cold read claim outlived the cold read').toBeNull();
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

describe('the sentence of a take whose listening failed (finding 5)', () => {
  it('does not double the full stop of the reason', async () => {
    const host = fakeHost();
    host.api.teleprompterStart = vi.fn(async () => {
      throw new Error('The microphone is in use by another application.');
    });
    mountBooth(host);
    await ready();
    await space();
    const text = await screen.findByText(/Recording did not start: the text cannot follow your voice/);
    expect(text.textContent).toContain('another application).');
    expect(text.textContent).not.toContain('.).');
  });
});

describe('a Stop while the take listening is still starting', () => {
  it('stops the DAW at once and lets the session go when it answers: the take that ended does not release the press claim early', async () => {
    // The mock host answers a start that was stopped meanwhile as started: the session is up after the Stop, and only the press can let it go.
    const host = fakeHost({ stopEndsStarting: false });
    const release = host.holdNextStart();
    const page = mountBooth(host);
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    await space();
    await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
    await release();
    await settle();
    await waitFor(() => expect(host.phase()).not.toBe('running'));
  });
});

// The class guard (#3320): whatever happens to a press whose listening start outlasts its limit, and however that start ends, the host's one session
// is never left running with nobody to stop it.
describe('a listening start that outlasts its limit never leaves a session running with no owner', () => {
  const outcomes = ['stopped', 'left', 'chapter changed', 'timed out'] as const;
  const answers = ['ok late', 'refused late', 'never'] as const;
  for (const outcome of outcomes) {
    for (const answer of answers) {
      it(`press ${outcome}, start answers: ${answer}`, async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
          // The host brings a session up after a Stop that came while it started (service.go: a stop before the child is spawned is a no-op).
          const host = fakeHost({ stopEndsStarting: false });
          const control = host.holdNextStart();
          const page = mountBooth(host);
          await ready();
          await space();
          await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
          await act(() => vi.advanceTimersByTimeAsync(1500));
          if (outcome === 'stopped') await space();
          if (outcome === 'left') page.view.unmount();
          if (outcome === 'chapter changed') await act(async () => driver.go('/booth?chapter=c2'));
          await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 1000));
          if (answer === 'ok late') await control();
          if (answer === 'refused late') await control.refuse();
          await act(() => vi.advanceTimersByTimeAsync(500));
          expect(host.phase(), 'the session is left running with nobody to stop it').not.toBe('running');
        } finally {
          vi.useRealTimers();
        }
      });
    }
  }
});

describe('a press that joined a session whose start then fails', () => {
  it('drops its take and says so', async () => {
    const host = fakeHost();
    const control = host.holdNextStart();
    const first = mountBooth(host);
    first.recordStart.mockImplementationOnce(refused);
    await ready();
    await space();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    first.view.unmount();
    const second = mountBooth(host);
    await ready();
    await space();
    await waitFor(() => expect(second.recordStart).toHaveBeenCalledTimes(1));
    await control.refuse();
    await waitFor(() => expect(second.recordStop).toHaveBeenCalled());
    expect(await screen.findByText(/Recording did not start: the text cannot follow your voice/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
  });
});

describe('the stop and the undo of a take whose listening failed', () => {
  const failing = () => {
    const host = fakeHost();
    host.api.teleprompterStart = vi.fn(async () => {
      throw new Error('The microphone is in use by another application.');
    });
    return host;
  };

  it('a stop that answers after its limit undoes nothing: the narrator was told to stop it in the DAW', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const page = mountBooth(failing());
      let answerStop: (result: Awaited<ReturnType<typeof page.daw.recordStop>>) => void = () => {};
      page.recordStop.mockImplementationOnce(() => new Promise((resolve) => (answerStop = resolve)));
      await ready();
      await space();
      await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStop + 5));
      await screen.findByText(/The recording could not be stopped: the stop did not answer in time\. Stop it in REAPER\./);
      await act(async () => answerStop({ ok: true, changed: true, message: '', undoSteps: 1 }));
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(page.undoLast).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an undo the DAW never answers ends at its limit with the take-back sentence, and Record is free', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const page = mountBooth(failing());
      page.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
      page.undoLast.mockImplementation(() => new Promise(() => {}));
      await ready();
      await space();
      await waitFor(() => expect(page.undoLast).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.undoLast + 5));
      await screen.findByText(/The short recording could not be taken back: the undo did not answer in time\. Undo it in REAPER\./);
      await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Record pressed while the session stop is still in flight', () => {
  it('waits for the stop and starts its own session, so the take is not recorded unheard behind a dying one', async () => {
    const host = fakeHost();
    const page = mountBooth(host);
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    host.holdStops();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await space();
    await waitFor(() => expect(host.phase()).toBe('stopping'));
    await space();
    await settle();
    // Not joined: no take starts behind the session that is ending.
    expect(page.recordStart).toHaveBeenCalledTimes(1);
    await host.finishStop();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(page.recordStart).toHaveBeenCalledTimes(2));
  });
});

describe('a cold read the narrator left behind says nothing on the page they are on now', () => {
  it('a model check that gives up after the chapter changed toasts nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      const assetsList = vi.fn(() => new Promise(() => {}));
      mountBooth(host, undefined, { assetsList: assetsList as never });
      await ready();
      await chooseCold();
      await act(async () => void fireEvent.click(main()));
      await waitFor(() => expect(assetsList).toHaveBeenCalled());
      await act(async () => driver.go('/booth?chapter=c2'));
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck + 100));
      expect(screen.queryByText(/The speech model could not be checked in time/)).toBeNull();
      expect(host.teleprompterStart).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a model check that is slow never ends a press with no take (#3432)', () => {
  const INSTALLED = { cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] };

  it('a check that has not answered by its limit lets the press go on: the take starts and no sentence says it did not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      const assetsList = vi.fn(() => new Promise(() => {}));
      const page = mountBooth(host, undefined, { assetsList: assetsList as never });
      await ready();
      await space();
      await waitFor(() => expect(assetsList).toHaveBeenCalled());
      expect(page.recordStart).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck + 5));
      await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalled());
      await waitFor(() => expect(page.recordStart).toHaveBeenCalled());
      expect(screen.queryByText(/could not be checked in time/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Record keeps its pending look the whole time a slow check is out, and the run log says the press went on (#3432)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      const assetsList = vi.fn(() => new Promise(() => {}));
      const page = mountBooth(host, undefined, { assetsList: assetsList as never });
      await ready();
      await space();
      await waitFor(() => expect(assetsList).toHaveBeenCalled());
      expect(main().getAttribute('aria-busy')).toBe('true');
      await act(() => vi.advanceTimersByTimeAsync(1_500));
      expect(main().getAttribute('aria-busy')).toBe('true');
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck - 2_000));
      expect(main().getAttribute('aria-busy')).toBe('true');
      expect(page.recordStart).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      await waitFor(() => expect(page.recordStart).toHaveBeenCalled());
      expect(logUi).toHaveBeenCalledWith('ui.record.limit', expect.stringContaining('stage=modelCheck'));
      expect(logUi).toHaveBeenCalledWith('ui.record.limit', expect.stringContaining('the press went on'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a check that answers late with the model missing opens no question over the take', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      let answer: (list: unknown) => void = () => {};
      const assetsList = vi.fn(() => new Promise((resolve) => (answer = resolve)));
      const page = mountBooth(host, undefined, { assetsList: assetsList as never });
      await ready();
      await space();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck + 5));
      await waitFor(() => expect(page.recordStart).toHaveBeenCalled());
      await act(async () => answer({ ...INSTALLED, assets: [{ kind: 'whisper', id: 'tiny', installState: 'not_installed', displayName: 'Tiny' }] }));
      expect(screen.queryByRole('dialog', { name: /Download local/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a joiner that waits for a session another press is starting (#3320)', () => {
  // Press A starts the session and its start is held; the narrator leaves, comes back and presses again (B joins and waits).
  // `slowStart`: the joiner's DAW start takes 8 s, so the chapter can still be changed while it is out.
  const joinWhileStarting = async (host: ReturnType<typeof fakeHost>, slowStart = false) => {
    const control = host.holdNextStart();
    const first = mountBooth(host);
    first.recordStart.mockImplementationOnce(refused);
    await ready();
    await space();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    first.view.unmount();
    const second = mountBooth(host);
    if (slowStart) {
      second.recordStart.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, changed: true, message: '', undoSteps: 0 } as never), 8000)),
      );
    }
    await ready();
    await space();
    await waitFor(() => expect(second.recordStart).toHaveBeenCalledTimes(1));
    return { control, second };
  };

  it('whose Booth is left while the start is out: the start answers ok and the session is stopped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
      const { control, second } = await joinWhileStarting(host);
      await act(() => vi.advanceTimersByTimeAsync(5000));
      second.view.unmount();
      await act(() => vi.advanceTimersByTimeAsync(15_000));
      await control();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 5000));
      expect(host.phase(), 'the session is left running with nobody to stop it').not.toBe('running');
      expect(host.teleprompterStop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('whose chapter changes while the start is out: the start answers ok and the session is stopped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
      const { control } = await joinWhileStarting(host, true);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await act(async () => driver.go('/booth?chapter=c2'));
      await act(() => vi.advanceTimersByTimeAsync(20_000));
      await control();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 5000));
      expect(host.phase(), 'the session is left running with nobody to stop it').not.toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('that times out with no live Booth while a session runs nobody else owns: the session is stopped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
      const { control, second } = await joinWhileStarting(host);
      // The host's pushes stop reaching the page, so no waiter ever hears the answer.
      host.muteEvents();
      second.view.unmount();
      await control();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 5000));
      expect(host.phase(), 'the session is left running with nobody to stop it').not.toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is released by a Stop: Record is free before the session it joined answers, and that session is let go when it does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
      const { control } = await joinWhileStarting(host);
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
      expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).getAttribute('aria-busy')).not.toBe('true');
      await control();
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(host.phase()).not.toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops listening for the host when it gives up: a host that never pushes leaves no listener behind', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
      const before = host.listenerCount();
      const { second } = await joinWhileStarting(host);
      expect(host.listenerCount()).toBeGreaterThan(before);
      second.view.unmount();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 3000));
      // Only the hooks' own subscriptions remain (the Booth was left).
      expect(host.listenerCount()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  const ends = ['left', 'chapter changed', 'stopped'] as const;
  const answers = ['ok', 'refused', 'never'] as const;
  for (const end of ends) {
    for (const answer of answers) {
      it(`class table: joiner ${end}, session answers ${answer}: no running session without a take`, async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
          const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
          const { control, second } = await joinWhileStarting(host, end === 'chapter changed');
          await act(() => vi.advanceTimersByTimeAsync(1500));
          if (end === 'left') second.view.unmount();
          if (end === 'chapter changed') await act(async () => driver.go('/booth?chapter=c2'));
          if (end === 'stopped') await space();
          await act(() => vi.advanceTimersByTimeAsync(15_000));
          if (answer === 'ok') await control();
          if (answer === 'refused') await control.refuse();
          await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 5000));
          // A take may remain only when the narrator did not end it and the session is up for it; none of these ends is that.
          expect(host.phase(), 'the session is left running with nobody to stop it').not.toBe('running');
        } finally {
          vi.useRealTimers();
        }
      });
    }
  }
});

describe('the chapter during a take that is still starting', () => {
  it('Next chapter is off until the DAW has answered, and changing chapter says why', async () => {
    const host = fakeHost();
    const page = mountBooth(host);
    let answer: (start: Awaited<ReturnType<typeof page.daw.recordStart>>) => void = () => {};
    page.recordStart.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await ready();
    await space();
    await waitFor(() => expect(page.recordStart).toHaveBeenCalledTimes(1));
    const next = screen.getByRole('button', { name: /Next chapter/ });
    await waitFor(() => expect(next.getAttribute('aria-disabled') === 'true' || (next as HTMLButtonElement).disabled).toBe(true));
    await act(async () => answer({ ok: true, changed: true, message: '', undoSteps: 0 } as never));
  });
});

describe('a session stop the host never finishes', () => {
  it('Record does not take a silent, unheard take: after the wait it asks for its own session, and the refused take is dropped with the sentence', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      const page = mountBooth(host);
      await ready();
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      host.holdStops();
      await act(() => vi.advanceTimersByTimeAsync(50));
      await space();
      await waitFor(() => expect(host.phase()).toBe('stopping'));
      await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
      await space();
      await act(() => vi.advanceTimersByTimeAsync(STOP_WAIT_FOR_TEST));
      await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/Recording did not start: the text cannot follow your voice/)).toBeTruthy();
      expect(page.recordStop).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// #3409: R (Punch and roll) is a press with a limit like the others. A roll the DAW never answers must not hold R for good.
describe('the roll of a take has a limit', () => {
  const r = () =>
    act(() => {
      fireEvent.keyDown(document.body, { key: 'r', code: 'KeyR' });
    });

  it('a roll the DAW never answers ends at its limit with a sentence that says to look, and R rolls again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const page = mountBooth(fakeHost());
      const roll = vi.spyOn(page.daw, 'roll');
      roll.mockImplementationOnce(() => new Promise(() => {}));
      await ready();
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      await r();
      await waitFor(() => expect(roll).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(/did not answer the roll in time/)).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.roll + 5));
      await screen.findByText(
        /REAPER did not answer the roll in time\. The take may still be recording from before; check REAPER, then press R to roll again\./,
      );
      roll.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      await r();
      await waitFor(() => expect(roll).toHaveBeenCalledTimes(2));
      await screen.findByText(/Rolling again from ¶ 1/);
    } finally {
      vi.useRealTimers();
    }
  });

  /** A take is running and R's roll has hung past its limit; `answer` is the DAW's late answer. */
  const hungRoll = async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const page = mountBooth(fakeHost());
    const roll = vi.spyOn(page.daw, 'roll');
    let answer: (value: Awaited<ReturnType<typeof page.daw.roll>>) => void = () => {};
    roll.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await r();
    await waitFor(() => expect(roll).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.roll + 5));
    await screen.findByText(/did not answer the roll in time/);
    const lands = (ok = true) =>
      act(async () => answer({ ok, changed: ok, message: ok ? '' : 'REAPER is busy.', refused: ok ? undefined : 'REAPER is busy.', undoSteps: 0 }));
    return { page, roll, lands };
  };

  const LANDED = /A roll the Booth stopped waiting for has landed\. REAPER may be recording, and a take in progress may have been cut\. Check REAPER\./;
  const CUT = LANDED;

  it('a roll that lands while the take still runs says to check the DAW and what to do with the take; nothing is stopped', async () => {
    try {
      const { page, lands } = await hungRoll();
      const stopsBefore = page.recordStop.mock.calls.length;
      await lands();
      await screen.findByText(LANDED);
      await screen.findByText(CUT);
      expect(page.recordStop.mock.calls.length).toBe(stopsBefore);
      expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that lands after a second R rolled says it once and stops nothing', async () => {
    try {
      const { page, roll, lands } = await hungRoll();
      roll.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      await r();
      await waitFor(() => expect(roll).toHaveBeenCalledTimes(2));
      await lands();
      await screen.findByText(LANDED);
      expect(page.recordStop).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that lands after the narrator pressed Stop says to check the DAW and sends no stop (BRK-8, BRK-9 class)', async () => {
    try {
      const { page, lands } = await hungRoll();
      await space();
      await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      await lands();
      await screen.findByText(LANDED);
      expect(page.recordStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that lands while the next take is still starting stops nothing (BRK-8)', async () => {
    try {
      const { page, lands } = await hungRoll();
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      page.recordStart.mockImplementationOnce(() => new Promise(() => {}));
      await space();
      await lands();
      await screen.findByText(LANDED);
      expect(page.recordStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that lands after the Booth was left says to check the DAW and stops nothing', async () => {
    try {
      const { page, lands } = await hungRoll();
      page.view.unmount();
      await act(() => vi.advanceTimersByTimeAsync(50));
      const afterLeave = page.recordStop.mock.calls.length;
      await lands();
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(page.recordStop.mock.calls.length).toBe(afterLeave);
      expect(
        page.overlay
          .getSnapshot()
          .toasts.map((toast) => toast.text)
          .join('\n'),
      ).toMatch(LANDED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that lands after a chapter change says to check the DAW and stops nothing', async () => {
    try {
      const { page, lands } = await hungRoll();
      await act(async () => driver.go('/booth?chapter=c2'));
      await waitFor(() => expect(page.overlay.getSnapshot().dialogs[0]).toBeTruthy());
      await act(async () => (page.overlay.getSnapshot().dialogs[0] as { answer: (yes: boolean) => void }).answer(true));
      await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(50));
      await lands();
      await screen.findByText(LANDED);
      expect(page.recordStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a late ok roll while take 2 records says to check the DAW, keeps take 2 running and sends no stop (BRK-1)', async () => {
    try {
      const { page, lands } = await hungRoll();
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      await lands();
      await screen.findByText(CUT);
      expect(page.recordStop).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refusal that lands while a newer take records does not blame that take (BRK-11)', async () => {
    try {
      const { page, lands } = await hungRoll();
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      await lands(false);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.queryByText(/could not roll again/)).toBeNull();
      expect(page.recordStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the late sentence replaces the roll's timeout sentence: exactly one roll toast is left (finding 2)", async () => {
    try {
      const { page, lands } = await hungRoll();
      const rollToasts = () =>
        page.overlay
          .getSnapshot()
          .toasts.map((toast) => toast.text)
          .filter((text) => /roll/i.test(text));
      expect(rollToasts()).toHaveLength(1);
      await lands();
      await screen.findByText(LANDED);
      expect(rollToasts()).toHaveLength(1);
      expect(screen.queryByText(/press R to roll again/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the roll's timeout sentence goes when the take ends", async () => {
    try {
      const { page } = await hungRoll();
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      expect(
        page.overlay
          .getSnapshot()
          .toasts.map((toast) => toast.text)
          .join('\n'),
      ).not.toMatch(/press R to roll again/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that answers ok inside its limit after Stop says it landed, and logs and moves nothing (finding 3)', async () => {
    const page = mountBooth(fakeHost());
    const roll = vi.spyOn(page.daw, 'roll');
    let answer: (value: Awaited<ReturnType<typeof page.daw.roll>>) => void = () => {};
    roll.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await act(async () => void fireEvent.keyDown(document.body, { key: 'r', code: 'KeyR' }));
    await waitFor(() => expect(roll).toHaveBeenCalledTimes(1));
    await space();
    await new Promise((r) => setTimeout(r, 1500));
    console.log(
      'BTNS',
      screen
        .getAllByRole('button')
        .map((b) => b.textContent || b.getAttribute('aria-label'))
        .join('|'),
    );
    await act(async () => answer({ ok: true, changed: true, message: '', undoSteps: 0 }));
    await screen.findByText(LANDED);
    expect(screen.queryByText(/Rolling again from/)).toBeNull();
    expect(page.recordStop).toHaveBeenCalledTimes(1);
  });

  /** A take runs, R's roll is out inside its limit, and a stop the DAW answers only when `finishStop` is called is in flight. */
  const rollWithStopPending = async (how: 'stop' | 'leave') => {
    const page = mountBooth(fakeHost());
    const roll = vi.spyOn(page.daw, 'roll');
    let answer: (value: Awaited<ReturnType<typeof page.daw.roll>>) => void = () => {};
    roll.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    let finishStop: (value: Awaited<ReturnType<typeof page.daw.recordStop>>) => void = () => {};
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await act(async () => void fireEvent.keyDown(document.body, { key: 'r', code: 'KeyR' }));
    await waitFor(() => expect(roll).toHaveBeenCalledTimes(1));
    page.recordStop.mockImplementationOnce(() => new Promise((resolve) => (finishStop = resolve)));
    if (how === 'stop') await space();
    else {
      await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
      await act(async () => (page.overlay.getSnapshot().dialogs[0] as { answer: (yes: boolean) => void }).answer(true));
    }
    await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(1));
    await act(async () => answer({ ok: true, changed: true, message: '', undoSteps: 0 }));
    return { page, finishStop: () => act(async () => finishStop({ ok: true, changed: true, message: '', undoSteps: 0 })) };
  };

  for (const how of ['stop', 'leave'] as const) {
    it(`a roll that answers while ${how === 'stop' ? 'Stop' : 'Stop and leave'} is still pending says it landed, not "Rolling again" (QA r5)`, async () => {
      const { page, finishStop } = await rollWithStopPending(how);
      await screen.findByText(LANDED);
      expect(screen.queryByText(/Rolling again from/)).toBeNull();
      await finishStop();
      expect(screen.queryByText(/Rolling again from/)).toBeNull();
      expect(page.recordStop).toHaveBeenCalledTimes(1);
    });
  }

  it('the landed sentence goes when a new take starts', async () => {
    try {
      const { page, lands } = await hungRoll();
      await lands();
      await screen.findByText(LANDED);
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      expect(screen.queryByText(LANDED)).not.toBeNull();
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      expect(
        page.overlay
          .getSnapshot()
          .toasts.map((toast) => toast.text)
          .join('\n'),
      ).not.toMatch(LANDED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refusal that lands after a later roll went through says nothing over the success (BRK late refusal)', async () => {
    try {
      const { page, roll, lands } = await hungRoll();
      roll.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      await r();
      await screen.findByText(/Rolling again from ¶/);
      await lands(false);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.queryByText(/could not roll again/)).toBeNull();
      expect(page.recordStop).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll that times out after REAPER already ended the take does not say the take may still be recording (BRK-3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const page = mountBooth(fakeHost());
      const roll = vi.spyOn(page.daw, 'roll');
      roll.mockImplementationOnce(() => new Promise(() => {}));
      await ready();
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      await r();
      await waitFor(() => expect(roll).toHaveBeenCalledTimes(1));
      await space();
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        'BTNS',
        screen
          .getAllByRole('button')
          .map((b) => b.textContent || b.getAttribute('aria-label'))
          .join('|'),
      );
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.roll + 5));
      expect(screen.queryByText(/did not answer the roll in time/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll the DAW refuses after the limit is said as an error, and stops nothing', async () => {
    try {
      const { page, lands } = await hungRoll();
      await lands(false);
      await screen.findByText(/A roll the Booth stopped waiting for was refused, so nothing was rolled: REAPER is busy\./);
      expect(page.recordStop).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// #3409: a stop the app itself sent (the unheard take dropped) pushes the DAW's transport event; that is not REAPER ending the take.
describe('a stop the app sent is not announced as REAPER stopping the take', () => {
  it('a dropped unheard take says it did not start, and not that REAPER stopped recording', async () => {
    // The listening refuses after the DAW's start answered, so the press has settled when the drop's own stop pushes its event.
    const host = fakeHost();
    const control = host.holdNextStart();
    const daw = dawFor('reaper');
    const listeners = new Set<(transport: { recording: boolean }) => void>();
    const push = (transport: { recording: boolean }) => listeners.forEach((listener) => listener(transport));
    daw.subscribeTransport = ((listener: (transport: { recording: boolean }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }) as unknown as typeof daw.subscribeTransport;
    const stop = daw.recordStop.bind(daw);
    daw.recordStop = (async () => {
      push({ recording: false });
      return stop();
    }) as typeof daw.recordStop;
    const page = mountBooth(host, daw);
    const toast = vi.spyOn(page.overlay, 'toast');
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    // REAPER pushes that it records once the Booth shows the take, so the Booth has heard the take it is about to drop.
    act(() => push({ recording: true }));
    await settle();
    await control.refuse();
    await screen.findByText(/Recording did not start: the text cannot follow your voice/);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Said once, whenever it comes: the toast is checked on its calls, not on what is on screen at the moment.
    expect(toast.mock.calls.map(([text]) => text).filter((text) => /REAPER stopped recording/.test(text))).toEqual([]);
  });
});

describe('a press the narrator left behind by changing chapter, whose take still records (#3409)', () => {
  const UNHEARD = /The text could not follow your voice for the take that is still recording\. Press Stop, then record again\./;
  const stopRefused = { ok: false, changed: false, message: 'REAPER did not answer.', refused: 'REAPER did not answer.', undoSteps: 0 };

  /**
   * A take records and its listening is out; the chapter is changed through the address and the stop is answered as the test says. The DAW pushes that it
   * records once the next chapter's page is up, so that page adopts the take as it would from the real DAW.
   */
  const changeChapterDuringStart = async (
    stop: 'refused' | 'ok',
    host = fakeHost(),
    { idleAtChange = false, adoptLate = false, beforeChange = () => {} } = {},
  ) => {
    const control = host.holdNextStart();
    const daw = dawFor('reaper');
    const listeners = new Set<(transport: { recording: boolean; playing: boolean; position: number }) => void>();
    let dawRecording = false;
    // The DAW's project read agrees with what it pushed, so a long wait in a test is not read as the take ending.
    const projectState = daw.projectState.bind(daw);
    daw.projectState = (async () => ({ ...(await projectState()), playState: dawRecording ? 'recording' : 'stopped' })) as typeof daw.projectState;
    const push = (recording: boolean) =>
      act(async () => {
        dawRecording = recording;
        listeners.forEach((listener) => listener({ recording, playing: recording, position: 1 }));
      });
    daw.subscribeTransport = ((listener: (transport: { recording: boolean; playing: boolean; position: number }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }) as unknown as typeof daw.subscribeTransport;
    const page = mountBooth(host, daw);
    if (stop === 'refused') page.recordStop.mockResolvedValueOnce(stopRefused as never);
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    // The DAW reads recording from the start, unless the test has the next chapter's page adopt the take later.
    if (!adoptLate) await push(true);
    // The host reads idle as the chapter changes, so the page that adopts the take asks for a session of its own.
    if (idleAtChange) await host.forceIdle();
    beforeChange();
    await act(async () => driver.go('/booth?chapter=c2'));
    await waitFor(() => expect(page.overlay.getSnapshot().dialogs[0]).toBeTruthy());
    await act(async () => (page.overlay.getSnapshot().dialogs[0] as { answer: (yes: boolean) => void }).answer(true));
    if (stop === 'refused') {
      await waitFor(() =>
        expect((page.overlay.getSnapshot().dialogs[0] as { spec: { confirmLabel: string } } | undefined)?.spec.confirmLabel).toBe('Leave anyway'),
      );
      await act(async () => (page.overlay.getSnapshot().dialogs[0] as { answer: (yes: boolean) => void }).answer(true));
    }
    await settle();
    return { host, control, page, push };
  };
  const toasted = (page: ReturnType<typeof mountBooth>) => vi.spyOn(page.overlay, 'toast');
  const said = (spy: ReturnType<typeof toasted>) => spy.mock.calls.map(([text]) => text).filter((text) => UNHEARD.test(text));

  it('Leave anyway after a stop that failed, then the listening is refused: the take is not stopped behind the narrator, and the sentence says what to do', async () => {
    const host = fakeHost();
    const { control, page, push } = await changeChapterDuringStart('refused', host);
    expect(page.recordStop).toHaveBeenCalledTimes(1);
    await push(true);
    // The next chapter's page sees the host's session starting (the press's own), so it asks for none: nothing else can follow the adopted take.
    await settle();
    expect(host.teleprompterStart).toHaveBeenCalledTimes(1);
    await control.refuse();
    await screen.findByText(UNHEARD);
    // The Booth acts on nothing for a press it no longer owns: no second stop (Stop is the narrator's, on the chapter that adopted the take).
    expect(page.recordStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Recording did not start/)).toBeNull();
  });

  it('says it when the host reads idle and the start is refused in the same turn (the page reads its own session when it settles)', async () => {
    const host = fakeHost();
    host.quietFailures();
    const { control, push } = await changeChapterDuringStart('refused', host);
    await push(true);
    await control.refuseIdle();
    await screen.findByText(UNHEARD);
  });

  it('says it when the listening comes up after Leave anyway and is let go: the take records and nothing follows it', async () => {
    const { control, page, push } = await changeChapterDuringStart('refused');
    await push(true);
    await control();
    await screen.findByText(UNHEARD);
    expect(page.recordStop).toHaveBeenCalledTimes(1);
  });

  it('says it once the session a listening that never answered left starting has settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      host.quietFailures();
      const { page, push } = await changeChapterDuringStart('refused', host);
      const toast = toasted(page);
      await push(true);
      await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.listening + 5));
      // The host is still `starting`: the take may yet be followed, so nothing is said.
      expect(said(toast)).toEqual([]);
      await host.forceIdle();
      await screen.findByText(UNHEARD);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is silent when the session the next chapter started for the adopted take is up: the take is followed', async () => {
    const host = fakeHost();
    host.quietFailures();
    const { control, page } = await changeChapterDuringStart('refused', host, { idleAtChange: true });
    const toast = toasted(page);
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(host.phase()).toBe('running'));
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
    // The page's own session ends later with the take still recording: the held report was about a press, not about that session.
    await host.forceIdle();
    await settle();
    expect(said(toast)).toEqual([]);
    expect(page.recordStop).toHaveBeenCalledTimes(1);
  });

  it('a report that waits for adoption says nothing when the page then starts its own listening and it follows (att15 N1d)', async () => {
    const host = fakeHost();
    host.quietFailures();
    // The next chapter's page mounts with the DAW reading stopped, so the stale press's report waits on a page that shows no take.
    const { control, page, push } = await changeChapterDuringStart('refused', host, { adoptLate: true });
    const toast = toasted(page);
    await control.refuseIdle();
    await settle();
    expect(said(toast)).toEqual([]);
    // The DAW then pushes the same take: the page adopts it and starts the listening that follows it.
    await push(true);
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(host.phase()).toBe('running'));
    await settle();
    expect(said(toast)).toEqual([]);
  });

  it("a take that ends while the page's own listening start is out leaves no session running when the start answers (break C)", async () => {
    // The real host ignores a stop while a session is still starting, so the stop the take's end sends does nothing and the start then comes up.
    const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
    host.quietFailures();
    let own: ReturnType<typeof host.holdNextStart> = Object.assign(async () => {}, { refuse: async () => {}, refuseIdle: async () => {} });
    const { page } = await changeChapterDuringStart('refused', host, { idleAtChange: true, beforeChange: () => void (own = host.holdNextStart()) });
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    skipStartGuard();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
    await waitFor(() => expect(page.recordStop).toHaveBeenCalledTimes(2));
    await settle();
    await own();
    await settle();
    await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
    await settle();
    expect(host.phase(), 'the session came up with no take and nothing stopped it').not.toBe('running');
  });

  it('a take that is still recording keeps the session its own start brought up', async () => {
    const host = fakeHost({ stopEndsStarting: false, ignoreStopWhileStarting: true });
    host.quietFailures();
    let own: ReturnType<typeof host.holdNextStart> = Object.assign(async () => {}, { refuse: async () => {}, refuseIdle: async () => {} });
    await changeChapterDuringStart('refused', host, { idleAtChange: true, beforeChange: () => void (own = host.holdNextStart()) });
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    await own();
    await settle();
    expect(host.phase()).toBe('running');
  });

  describe('the late start of an adopted take whose Booth was left and opened again (break D)', () => {
    /** The page that adopted the take asks for listening (held), is left with Leave anyway, and a new Booth mounts at `search`; the DAW read decides if a take still records. */
    const leaveAndReturn = async ({ search = '?chapter=c2', takeEndsMeanwhile = false } = {}) => {
      const host = fakeHost();
      host.quietFailures();
      let own: ReturnType<typeof host.holdNextStart> = Object.assign(async () => {}, { refuse: async () => {}, refuseIdle: async () => {} });
      const { page, push } = await changeChapterDuringStart('refused', host, { idleAtChange: true, beforeChange: () => void (own = host.holdNextStart()) });
      await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
      page.view.unmount();
      if (takeEndsMeanwhile) await push(false);
      const back = mountBooth(host, page.daw, {}, search);
      if (!takeEndsMeanwhile) await screen.findByRole('button', { name: /^Stop$/ });
      else await screen.findByRole('button', { name: /^Record$/ });
      return { host, own, back, push };
    };

    it('keeps the listening the Booth that came back is following: the old start answers ok and nothing is stopped', async () => {
      const { host, own } = await leaveAndReturn();
      host.teleprompterStop.mockClear();
      await own();
      await settle();
      expect(host.teleprompterStop).not.toHaveBeenCalled();
      expect(host.phase()).toBe('running');
    });

    it('the take that ends later lets the handed-over listening go, and the claim with it', async () => {
      const { host, own, back } = await leaveAndReturn();
      await own();
      await settle();
      skipStartGuard();
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
      await waitFor(() => expect(back.recordStop).toHaveBeenCalled());
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
      await waitFor(() => expect(host.phase()).not.toBe('running'));
      expect(joinListening(), 'a claim outlived the session it was for').toBeNull();
    });

    it('a Booth showing another chapter is not handed the session: it is let go, as with no Booth', async () => {
      const { host, own } = await leaveAndReturn({ search: '?chapter=c1' });
      await own();
      await settle();
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
      expect(host.phase()).not.toBe('running');
    });

    it('a Booth that shows no take (it ended while away) is not handed the session: it is let go', async () => {
      const { host, own } = await leaveAndReturn({ takeEndsMeanwhile: true });
      await own();
      await settle();
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
      expect(host.phase()).not.toBe('running');
    });

    it('a Booth left again with a handed-over session lets it go, so a take that ends while away leaves nothing running or claimed', async () => {
      const { host, own, back, push } = await leaveAndReturn();
      await own();
      await settle();
      expect(host.phase()).toBe('running');
      back.view.unmount();
      await push(false);
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
      expect(host.phase()).not.toBe('running');
      expect(joinListening(), 'a claim outlived the session it was for').toBeNull();
    });

    it('with no Booth left the late start is still stopped', async () => {
      const host = fakeHost();
      host.quietFailures();
      let own: ReturnType<typeof host.holdNextStart> = Object.assign(async () => {}, { refuse: async () => {}, refuseIdle: async () => {} });
      const { page } = await changeChapterDuringStart('refused', host, { idleAtChange: true, beforeChange: () => void (own = host.holdNextStart()) });
      await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
      page.view.unmount();
      await own();
      await settle();
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
    });
  });

  describe('the adopting page is in a cold read (att16 K1)', () => {
    /** A report is held on a page with no take; the narrator starts a cold read there; the DAW then reports the take, so the page ends the cold read and listens for it. */
    const adoptDuringColdRead = async (ownStart: 'comes up' | 'fails' | 'refused') => {
      const host = fakeHost();
      host.quietFailures();
      const { control, page, push } = await changeChapterDuringStart('refused', host, { adoptLate: true });
      const toast = toasted(page);
      await control.refuseIdle();
      await settle();
      await host.forceColdRunning();
      // The listening the adopting page asks for once the cold read has ended.
      let release: () => Promise<void> = async () => {};
      if (ownStart === 'refused')
        host.teleprompterStart.mockImplementationOnce(async () => Promise.reject(new Error('a teleprompter session is already running')));
      else {
        const held = host.holdNextStart();
        release = ownStart === 'comes up' ? () => held() : () => held.refuse();
      }
      await push(true);
      await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
      return { host, page, toast, release };
    };

    /** The adopting page ends a cold read whose stop takes a while: `host.finishStop()` answers it. */
    const adoptWithSlowColdStop = async () => {
      const host = fakeHost();
      host.quietFailures();
      host.holdStops();
      const { control, page, push } = await changeChapterDuringStart('refused', host, { adoptLate: true });
      await control.refuseIdle();
      await settle();
      await host.forceColdRunning();
      await push(true);
      await waitFor(() => expect(host.teleprompterStop).toHaveBeenCalled());
      return { host, page, push };
    };
    const noSessionStarted = async (host: ReturnType<typeof fakeHost>) => {
      await host.finishStop();
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Only the press's own start was ever made; nothing listens, and the host is not left running.
      expect(host.teleprompterStart).toHaveBeenCalledTimes(1);
      expect(host.phase()).not.toBe('running');
    };

    it('an adopted take that ends before the cold read stop answers starts no session', async () => {
      const { host, push } = await adoptWithSlowColdStop();
      await push(false);
      await noSessionStarted(host);
    });

    it("an adopted take's listening is not started after the Booth is left", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { host, page } = await adoptWithSlowColdStop();
        page.view.unmount();
        // The hook's wait for the stop gives up on its own after a while, as it does when a host never says the session ended.
        await act(() => vi.advanceTimersByTimeAsync(STOP_WAIT_FOR_TEST));
        await noSessionStarted(host);
      } finally {
        vi.useRealTimers();
      }
    });

    it('Stop pressed while the page waits for the cold read to end starts no session', async () => {
      const { host } = await adoptWithSlowColdStop();
      skipStartGuard();
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
      await noSessionStarted(host);
    });

    it('does not say the take is unheard when the page ends the cold read and its own listening for the take comes up', async () => {
      const { host, toast, release } = await adoptDuringColdRead('comes up');
      await settle();
      // The cold read has ended and the new start is not answered yet: nothing follows the take for this moment, and nothing is said.
      expect(said(toast)).toEqual([]);
      await release();
      await waitFor(() => expect(host.phase()).toBe('running'));
      await settle();
      expect(said(toast)).toEqual([]);
    });

    it('does not add the sentence when that listening fails and says so itself', async () => {
      const { toast, release } = await adoptDuringColdRead('fails');
      await release();
      await settle();
      expect(said(toast)).toEqual([]);
    });

    it('says the sentence once when the listening is refused with nothing running', async () => {
      const { toast } = await adoptDuringColdRead('refused');
      await settle();
      await screen.findByText(UNHEARD);
      expect(said(toast)).toHaveLength(1);
    });
  });

  it.each([
    ['9.9 s', 9_900, true],
    ['10.1 s', 10_100, false],
  ])('a report waits 10 s for the page to adopt the take: adopted at %s, then the session settles', async (_name, wait, spoken) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const host = fakeHost();
      host.quietFailures();
      const { control, page, push } = await changeChapterDuringStart('refused', host, { adoptLate: true });
      const toast = toasted(page);
      await control.refuse();
      await act(() => vi.advanceTimersByTimeAsync(wait));
      await push(true);
      await settle();
      // The host still reads starting (the press's own session), so the page starts none and waits for it to settle.
      await host.forceIdle();
      await settle();
      expect(said(toast).length).toBe(spoken ? 1 : 0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds nothing when the next chapter's own listening failed and said so: one sentence", async () => {
    const host = fakeHost();
    host.quietFailures();
    let own: ReturnType<typeof host.holdNextStart> = Object.assign(async () => {}, { refuse: async () => {}, refuseIdle: async () => {} });
    const { control, page } = await changeChapterDuringStart('refused', host, { idleAtChange: true, beforeChange: () => void (own = host.holdNextStart()) });
    const toast = toasted(page);
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(2));
    await own.refuse();
    await host.forceIdle();
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
    expect(said(toast)).toEqual([]);
  });

  it('is silent when REAPER or the narrator ended the take before the listening failed', async () => {
    const { control, page, push } = await changeChapterDuringStart('refused');
    const toast = toasted(page);
    await push(true);
    await settle();
    await push(false);
    await settle();
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
  });

  it('is silent when the take ended in the DAW while no Booth was open: the Booth opened after shows no take', async () => {
    const host = fakeHost();
    const control = host.holdNextStart();
    const first = mountBooth(host);
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    first.view.unmount();
    // The narrator ends the take in the DAW and opens the Booth again; the DAW reports nothing recording.
    const second = mountBooth(host);
    const toast = toasted(second);
    await ready();
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
  });

  it('is silent when a newer press began meanwhile: the take that records is not the one this press began', async () => {
    const { control, page, push } = await changeChapterDuringStart('refused');
    const toast = toasted(page);
    await push(true);
    // The narrator stops the adopted take and presses Record again on the chapter that is up.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
    await push(false);
    await settle();
    await space();
    await waitFor(() => expect(page.recordStart).toHaveBeenCalledTimes(2));
    await push(true);
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
  });

  it('goes when the take ends: the sentence does not stay beside "Stopped. Recorded"', async () => {
    const { control, push } = await changeChapterDuringStart('refused');
    await push(true);
    await control.refuse();
    await screen.findByText(UNHEARD);
    await push(false);
    await waitFor(() => expect(screen.queryByText(UNHEARD)).toBeNull());
  });

  it('a Booth that is gone says nothing: the sentence names a Stop that is not on the page the narrator is on', async () => {
    const host = fakeHost();
    const control = host.holdNextStart();
    const page = mountBooth(host);
    const toast = toasted(page);
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    page.view.unmount();
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
  });

  it('Stop and leave whose stop went through says nothing when the listening is refused later: the take is over', async () => {
    const { control, page } = await changeChapterDuringStart('ok');
    expect(page.recordStop).toHaveBeenCalledTimes(1);
    const toast = toasted(page);
    await control.refuse();
    await settle();
    expect(said(toast)).toEqual([]);
  });
});
