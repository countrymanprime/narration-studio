// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import type { ReadAloudReaperState, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { forgetAppTake, HELD_TOPIC, POLL_MS, TAKE_TOPIC, useRecordControl } from './useRecordControl';

// #3666: "If the right project is open and the right chapter is armed, the app must treat it properly and start listening, even when the take was
// started in the DAW." The take is the DAW's own (the narrator pressed Record there); the Booth adopts it as its running take when the linked project
// is the open one and the chapter's lane is the one armed, and never touches the DAW for it.

beforeEach(() => {
  forgetAppTake();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(5)));
const tick = () => act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS + 10)));

type World = {
  /** What the DAW holds: the truth every read answers. */
  recording: boolean;
  /** What the host answers for the chapter (`readAloudReaperState`) while REAPER records. */
  status: ReadAloudReaperStatus;
  armedCount: number;
  /** Whether the linked project is the open one. */
  sameProject: boolean;
  quiet: boolean;
  /** Reads of the chapter's lane never answer / fail / repeat the last answer. */
  lane: 'live' | 'hang' | 'fail' | 'stale';
};

const QUIET: DawCapabilities = {
  ...DAW_SETUPS.reaper,
  reachable: false,
  capabilities: {
    ...DAW_SETUPS.reaper.capabilities,
    record: { level: 'experimental', available: false, reason: 'not_running', message: 'REAPER is not answering.' },
  },
};

async function open(init: Partial<World> = {}, chapterId = 'c1') {
  const world: World = { recording: false, status: 'recording_here', armedCount: 1, sameProject: true, quiet: false, lane: 'live', ...init };
  const transportListeners = new Set<(next: DawTransport) => void>();
  const sendTransport = (next: DawTransport) => transportListeners.forEach((listener) => listener(next));
  const capabilityListeners = new Set<(next: DawCapabilities) => void>();
  const available = DAW_SETUPS.reaper;
  const recordStop = vi.fn(async () => ({ ok: true, changed: true, undoSteps: 0, message: 'stopped' }));
  const recordStart = vi.fn(async () => ({ ok: true, changed: true, undoSteps: 0, message: 'started' }));
  const client: DawClient = {
    ...dawClientFor('reaper'),
    capabilities: async () => (world.quiet ? QUIET : available),
    subscribeCapabilities: (listener) => (capabilityListeners.add(listener), () => void capabilityListeners.delete(listener)),
    subscribeTransport: (listener) => (transportListeners.add(listener), () => void transportListeners.delete(listener)),
    projectState: async (): Promise<DawProjectState> => {
      if (world.quiet) throw new Error('no answer');
      return { savedAt: null, unsavedChanges: false, playState: world.recording ? 'recording' : 'stopped', playPosition: world.recording ? 42 : 0 };
    },
    recordStart,
    recordStop,
  };
  let last: ReadAloudReaperState = { status: 'ready', message: '', trackGuid: '{T}', armedCount: 1, playing: false, recording: false };
  const reads = vi.fn();
  const api = createMockApi({
    bootstrap: async () => ({ ...(await createMockApi().bootstrap()), dawFileLinked: true, dawReachable: !world.quiet, dawProjectMatches: world.sameProject }),
    readAloudReaperState: async () => {
      reads();
      if (world.lane === 'hang') return new Promise<ReadAloudReaperState>(() => {});
      if (world.lane === 'fail') throw new Error('no answer');
      if (world.lane === 'stale') return last;
      last = {
        status: world.recording ? world.status : 'ready',
        message: '',
        trackGuid: '{T}',
        armedCount: world.recording ? world.armedCount : 1,
        playing: world.recording,
        recording: world.recording,
      };
      return last;
    },
  } as Partial<NarrationApi>);
  const overlay = createOverlayService();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>
        <OverlayProvider service={overlay}>{children}</OverlayProvider>
      </PortOverrides>
    </ApiProvider>
  );
  const notify = vi.fn();
  const onStarted = vi.fn();
  const hook = renderHook(() => useRecordControl({ chapterId, notify, onStarted }), { wrapper });
  await settle();
  /** The narrator presses Record (or Stop) in the DAW itself: the DAW's truth changes and says so. */
  const dawTake = async (on: boolean) => {
    world.recording = on;
    act(() => sendTransport({ playing: on, recording: on, position: on ? 42 : undefined }));
    await settle();
  };
  const quiet = async (on: boolean) => {
    world.quiet = on;
    act(() => capabilityListeners.forEach((listener) => listener(on ? QUIET : available)));
    await settle();
  };
  return { world, hook, notify, onStarted, recordStop, recordStart, dawTake, quiet, reads, overlay, wrapper, api };
}

describe('a take started in the DAW (#3666)', () => {
  it("is the Booth's running take when the right project is open and the chapter's lane is the one armed, and the DAW is not touched", async () => {
    const { hook, dawTake, recordStop, recordStart, onStarted } = await open();
    expect(hook.result.current.recording).toBe(false);

    await dawTake(true);

    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    expect(hook.result.current.gate).toBeNull();
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ position: 42 }));
    expect(recordStop).not.toHaveBeenCalled();
    expect(recordStart).not.toHaveBeenCalled();
  });

  it('is found at once when the take began before the Booth connected, and begins where the DAW is (QA B5)', async () => {
    const { hook, onStarted } = await open({ recording: true });
    await tick();
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ position: 42 }));
  });

  it('is not adopted with another project open: Record says so, and that the DAW is recording', async () => {
    const { hook, dawTake } = await open({ sameProject: false });
    await dawTake(true);
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.disabled).toBe(true);
    expect(hook.result.current.reason).toMatch(/different project open/);
    expect(hook.result.current.reason).toMatch(/is recording a take now/);
  });

  it.each<[ReadAloudReaperStatus, number, string]>([
    ['recording_elsewhere', 1, 'other_track'],
    ['recording_elsewhere', 2, 'several_tracks'],
    ['recording_elsewhere', 0, 'no_track_armed'],
    ['no_link', 0, 'unread'],
    ['unavailable', 0, 'unread'],
  ])('is not adopted when the host says %s with %i armed, and the reason is named (%s)', async (status, armedCount, why) => {
    const { hook, dawTake } = await open({ status, armedCount });
    await dawTake(true);
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.notFollowed).toBe(why);
  });

  it('is not adopted when the read of the lane fails, and is on the next read that answers', async () => {
    const { hook, dawTake, world } = await open({ lane: 'fail' });
    await dawTake(true);
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.notFollowed).toBe('unread');
    world.lane = 'live';
    await tick();
    expect(hook.result.current.recording).toBe(true);
  });

  it('says nothing is elsewhere while the lane is still being read, and reads it once, not on every render (QA B9)', async () => {
    const { hook, dawTake, world, reads } = await open({ lane: 'hang' });
    const before = reads.mock.calls.length;
    await dawTake(true);
    expect(hook.result.current.gate).toBeNull();
    expect(hook.result.current.notFollowed).toBeNull();
    await tick();
    // One read at the take, one at the next poll: not a read per state change.
    expect(reads.mock.calls.length - before).toBeLessThanOrEqual(3);
    world.lane = 'live';
  });

  it('Stop on it asks the DAW nothing and says it stops there; the end of the chapter ends nothing in the DAW and says nothing', async () => {
    const { hook, dawTake, recordStop, notify } = await open();
    await dawTake(true);

    let stopped = true;
    await act(async () => void (stopped = await hook.result.current.toggle()));
    expect(stopped).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/started this take.*stop it in REAPER/i), HELD_TOPIC);
    notify.mockClear();

    await act(async () => void (await hook.result.current.toggle(undefined, { automatic: true })));
    expect(notify).not.toHaveBeenCalled();
    expect(recordStop).not.toHaveBeenCalled();
    expect(hook.result.current.recording).toBe(true);
  });

  it('ends when REAPER stops it, with a neutral sentence, and the next take in REAPER is adopted again', async () => {
    const { hook, dawTake, notify, onStarted } = await open();
    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);

    await dawTake(false);
    expect(hook.result.current.recording).toBe(false);
    expect(notify).toHaveBeenCalledWith('The take ended in REAPER.', TAKE_TOPIC);
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/stopped recording/), expect.anything());

    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    expect(onStarted).toHaveBeenCalledTimes(2);
  });

  it('a take that ends and starts again within a moment is two takes (quick restart)', async () => {
    const { hook, dawTake, onStarted } = await open();
    await dawTake(true);
    await dawTake(false);
    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(2);
  });

  it('the stop-it sentence goes when the take ends', async () => {
    const { hook, dawTake, overlay } = await open();
    const dismiss = vi.spyOn(overlay, 'dismissTopic');
    await dawTake(true);
    await act(async () => void (await hook.result.current.toggle()));
    dismiss.mockClear();
    await dawTake(false);
    expect(dismiss).toHaveBeenCalledWith(HELD_TOPIC);
  });

  it('the chip does not say "recording elsewhere" for a read made during the take once the transport stopped (walkthrough 8)', async () => {
    const { hook, dawTake, world } = await open({ status: 'recording_elsewhere' });
    await dawTake(true);
    expect(hook.result.current.dawStatus).toBe('recording_elsewhere');
    world.lane = 'stale';
    await dawTake(false);
    expect(hook.result.current.dawStatus).toBeNull();
  });
});

describe("a take the Booth pressed stays the app's", () => {
  it("a press whose transport event arrives before its answer is not taken for the DAW's (QA B2)", async () => {
    const { hook, world, recordStart, dawTake, onStarted, recordStop } = await open();
    recordStart.mockImplementation(async () => {
      world.recording = true;
      // The DAW says it records before the host's answer comes.
      await dawTake(true);
      await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
      return { ok: true, changed: true, undoSteps: 0, message: 'started' };
    });
    await act(async () => void (await hook.result.current.toggle()));
    await settle();
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(1);

    skipGuard();
    await act(async () => void (await hook.result.current.toggle()));
    expect(recordStop).toHaveBeenCalledTimes(1);
  });

  it("after the DAW went quiet and came back still recording, it is still the app's: Stop reaches the DAW (QA B3)", async () => {
    const { hook, world, recordStart, recordStop, quiet } = await open();
    recordStart.mockImplementation(async () => {
      world.recording = true;
      return { ok: true, changed: true, undoSteps: 0, message: 'started' };
    });
    await act(async () => void (await hook.result.current.toggle()));
    expect(hook.result.current.startedByApp).toBe(true);

    await quiet(true);
    await tick();
    await tick();
    await quiet(false);
    await tick();

    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(true);
    skipGuard();
    await act(async () => void (await hook.result.current.toggle()));
    expect(recordStop).toHaveBeenCalledTimes(1);
  });
});

describe('a take found again after the Booth was left (QA B1)', () => {
  it("is still the DAW's: Stop asks the DAW nothing", async () => {
    const first = await open();
    await first.dawTake(true);
    expect(first.hook.result.current.recording).toBe(true);
    first.hook.unmount();

    // A Booth opened again while REAPER still records the take it started.
    const second = await open({ recording: true });
    await tick();
    expect(second.hook.result.current.recording).toBe(true);
    expect(second.hook.result.current.startedByApp).toBe(false);
    await act(async () => void (await second.hook.result.current.toggle()));
    expect(second.recordStop).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<World>]>([
    ['another lane', { status: 'recording_elsewhere' }],
    ['another project', { sameProject: false }],
  ])('is not followed on %s after the leave', async (_name, change) => {
    const first = await open();
    await first.dawTake(true);
    first.hook.unmount();

    const second = await open({ recording: true, ...change });
    await tick();
    expect(second.hook.result.current.recording).toBe(false);
  });

  it('class guard: an adoption followed by an unmount and a remount never yields startedByApp true', async () => {
    for (let round = 0; round < 3; round++) {
      const view = await open({ recording: true });
      await tick();
      expect(view.hook.result.current.recording).toBe(true);
      expect(view.hook.result.current.startedByApp).toBe(false);
      view.hook.unmount();
    }
  });
});

describe('a take being followed is read again (QA B4, B8)', () => {
  it('stops following, with one sentence and nothing sent to the DAW, when the lane is no longer the one armed', async () => {
    const { hook, dawTake, world, notify, recordStop } = await open();
    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);

    world.status = 'recording_elsewhere';
    world.armedCount = 2;
    await tick();

    expect(hook.result.current.recording).toBe(false);
    expect(notify).toHaveBeenCalledWith('REAPER is recording another track now, so the Booth stopped listening.', HELD_TOPIC);
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('stops following when the open project is no longer the linked one', async () => {
    const { hook, dawTake, world, notify } = await open();
    await dawTake(true);
    world.sameProject = false;
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(notify).toHaveBeenCalledWith('REAPER has another project open now, so the Booth stopped listening.', HELD_TOPIC);
  });

  it('keeps following when a read fails: nothing is concluded from it', async () => {
    const { hook, dawTake, world } = await open();
    await dawTake(true);
    world.lane = 'fail';
    await tick();
    expect(hook.result.current.recording).toBe(true);
  });

  it("when the DAW goes quiet mid-take the take ends unconfirmed and is still not the app's (the leave question says so)", async () => {
    const { hook, dawTake, quiet } = await open();
    await dawTake(true);
    await quiet(true);
    await tick();
    // The Booth can't tell: the take is still shown, and still the DAW's.
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    await dawTake(false);
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.startedByApp).toBe(false);
  });
});

function skipGuard() {
  // The press just made ended the start guard's window in a real session.
  vi.setSystemTime(Date.now() + 2000);
}
