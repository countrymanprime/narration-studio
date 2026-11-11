// @vitest-environment jsdom
// #3320: the host has ONE listening session and one DAW take, and a press's continuation (its listening start, its stop, its late answer) acts on them.
// Each of these runs the real page against a host that behaves as the real one does (one session at a time; a second start while one runs is
// refused; a stop ends whatever runs) and holds the answers a test names, so a press that outlived its Booth shows what it does to the next one.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { PRESS_LIMITS_MS } from '../record/pressLimits';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { forgetListeningClaims } from '../listening/listeningClaims';
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
      publish({ phase: 'error', message: 'the microphone is in use' });
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
    /** The next start does not answer until the returned function is called. */
    holdNextStart: () => {
      let release = () => {};
      let fail = () => {};
      gates.push(new Promise<void>((resolve, reject) => ((release = resolve), (fail = () => reject(new Error('the microphone is in use'))))));
      const answer = () => act(async () => release());
      return Object.assign(answer, { refuse: () => act(async () => fail()) });
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
function mountBooth(host: ReturnType<typeof fakeHost>, daw = dawFor('reaper'), over: Partial<NarrationApi> = {}) {
  const recordStart = vi.spyOn(daw, 'recordStart');
  const recordStop = vi.spyOn(daw, 'recordStop');
  const undoLast = vi.spyOn(daw, 'undoLast');
  const overlay = createOverlayService();
  const api = pageApi({ passageMapRecordRun: async () => {}, ...host.api, ...over } as Partial<NarrationApi>);
  const view = render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
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

  const LANDED =
    /A roll the Booth stopped waiting for has landed, so REAPER may be recording from it, and a take you are recording may have been cut and restarted\. Check REAPER and stop it there; record the passage again if needed\./;
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
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull());
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
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull());
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
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull());
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
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull());
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
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull());
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
