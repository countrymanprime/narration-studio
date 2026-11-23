// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import type { ReadAloudReaperState, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient, DawRecordStart } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { createLeaveGuard } from '../../../studio/journal/leaveGuard';
import { useBoothLeaveGuard } from '../leave/useBoothLeaveGuard';
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
  /** Where the play head is while REAPER records (the take began at 42). */
  head?: number;
  /** Whether the DAW's project file is linked here (default yes). */
  linked?: boolean;
  /** The next read of the link (`bootstrap`) waits for this, once. */
  bootstrapGate?: Promise<void> | null;
  /** Reads of the DAW's transport (`projectState`) fail. */
  projectFails?: boolean;
  /** Reads of the DAW's capabilities wait for this. */
  capsGate?: Promise<void> | null;
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
    capabilities: async () => {
      if (world.capsGate) await world.capsGate;
      return world.quiet ? QUIET : available;
    },
    subscribeCapabilities: (listener) => (capabilityListeners.add(listener), () => void capabilityListeners.delete(listener)),
    subscribeTransport: (listener) => (transportListeners.add(listener), () => void transportListeners.delete(listener)),
    projectState: async (): Promise<DawProjectState> => {
      if (world.quiet || world.projectFails) throw new Error('no answer');
      return {
        savedAt: null,
        unsavedChanges: false,
        playState: world.recording ? 'recording' : 'stopped',
        playPosition: world.recording ? (world.head ?? 42) : 0,
      };
    },
    recordStart,
    recordStop,
  };
  let last: ReadAloudReaperState = { status: 'ready', message: '', trackGuid: '{T}', armedCount: 1, playing: false, recording: false };
  const reads = vi.fn();
  const api = createMockApi({
    bootstrap: async () => {
      const gate = world.bootstrapGate;
      if (gate) {
        world.bootstrapGate = null;
        await gate;
      }
      return { ...(await createMockApi().bootstrap()), dawFileLinked: world.linked ?? true, dawReachable: !world.quiet, dawProjectMatches: world.sameProject };
    },
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
  // What every committed render said, not only the last: a state that is wrong for one render is wrong for the narrator who sees it.
  const renders: { notFollowed: string | null; gate: string | null }[] = [];
  const hook = renderHook(
    () => {
      const control = useRecordControl({ chapterId, notify, onStarted });
      renders.push({ notFollowed: control.notFollowed, gate: control.gate?.cause ?? null });
      return control;
    },
    { wrapper },
  );
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
  const sendCaps = (picture: DawCapabilities) => act(() => capabilityListeners.forEach((listener) => listener(picture)));
  return { world, hook, notify, onStarted, recordStop, recordStart, dawTake, quiet, reads, overlay, wrapper, api, renders, sendTransport, sendCaps };
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
    expect(hook.result.current.facts).toMatchObject({ openProject: 'different', dawRecording: true });
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
    // The footer and the press say it too, not only the chip's tooltip.
    const clause = { other_track: 'on another track', several_tracks: 'with several tracks armed', no_track_armed: 'with no track armed' }[why];
    if (clause) expect(hook.result.current.reason).toBe(`REAPER is already recording ${clause}. Stop it there first.`);
    else expect(hook.result.current.reason).toBe('REAPER is already recording. Stop it there first.');
  });

  it('with no project linked here, the reason is the missing link, in the footer and for the chip (walkthrough 6)', async () => {
    const { hook, dawTake } = await open({ linked: false });
    await dawTake(true);
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.notFollowed).toBe('no_project');
    expect(hook.result.current.reason).toBe('REAPER is already recording, and no project file is linked. Link one first.');
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
    expect(notify).toHaveBeenCalledWith('REAPER is recording another track now, so the Booth stopped listening.', 'daw-stopped-listening');
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('stops following when the open project is no longer the linked one', async () => {
    const { hook, dawTake, world, notify } = await open();
    await dawTake(true);
    world.sameProject = false;
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(notify).toHaveBeenCalledWith('REAPER has another project open now, so the Booth stopped listening.', 'daw-stopped-listening');
  });

  it('keeps following when a read fails: nothing is concluded from it', async () => {
    const { hook, dawTake, world } = await open();
    await dawTake(true);
    world.lane = 'fail';
    await tick();
    expect(hook.result.current.recording).toBe(true);
  });

  it("when the DAW goes quiet mid-take the take ends unconfirmed and is still not the app's (the leave question says so)", async () => {
    const { hook, dawTake, quiet, notify } = await open();
    await dawTake(true);
    await quiet(true);
    await tick();
    // The Booth can't tell: the take is still shown, and still the DAW's.
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    await dawTake(false);
    expect(hook.result.current.recording).toBe(false);
    // The end is not confirmed (the DAW is quiet): who started the take is kept, so the leave question never offers to stop it (intent B2).
    expect(hook.result.current.startedByApp).toBe(false);
    expect(hook.result.current.endUnconfirmed()).toBe(true);
    await quiet(false);
    await tick();
    // A take REAPER started was followed, not ended by the Booth: the sentence says it stopped listening (walkthrough 8).
    expect(notify).toHaveBeenCalledWith(
      'REAPER answers again. The Booth stopped listening to its take when REAPER went quiet; check in REAPER whether it is still recording.',
      TAKE_TOPIC,
    );
    // The DAW answers: the take is over for certain, and nothing runs that is the DAW's (QA B4).
    expect(hook.result.current.startedByApp).toBe(true);
    expect(hook.result.current.endUnconfirmed()).toBe(false);
  });
});

function skipGuard() {
  // The press just made ended the start guard's window in a real session.
  vi.setSystemTime(Date.now() + 2000);
}

/** The app presses Record and REAPER starts the take. */
const appRecords = async (view: Awaited<ReturnType<typeof open>>) => {
  view.recordStart.mockImplementation(async () => {
    view.world.recording = true;
    return { ok: true, changed: true, undoSteps: 0, message: 'started' };
  });
  await act(async () => void (await view.hook.result.current.toggle()));
  expect(view.hook.result.current.startedByApp).toBe(true);
};

describe("a claim on the app's own take is dropped once the DAW says it is not recording (QA B1, B2)", () => {
  async function endedWhileQuiet() {
    const view = await open();
    await appRecords(view);
    await view.dawTake(true);
    await view.quiet(true);
    await tick();
    // The take ends in REAPER while it is not answering; the Booth stops showing it, and the claim is kept, as its take may still run.
    await view.dawTake(false);
    expect(view.hook.result.current.recording).toBe(false);
    await view.quiet(false);
    await tick();
    await tick();
    return view;
  }

  it("a claim kept through a quiet is dropped once the DAW answers that it is not recording: the next take in REAPER is the DAW's, and is followed only on the chapter's lane", async () => {
    const view = await endedWhileQuiet();
    expect(view.hook.result.current.recording).toBe(false);
    view.world.status = 'recording_elsewhere';
    view.world.armedCount = 2;
    await view.dawTake(true);
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.hook.result.current.notFollowed).toBe('several_tracks');
  });

  it("the next take in REAPER on the chapter's lane after that is followed, and is not the app's", async () => {
    const view = await endedWhileQuiet();
    await view.dawTake(true);
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(false);
  });

  it('the claim is kept while the DAW still answers that it records after a quiet: Stop reaches the DAW (the existing quiet case)', async () => {
    const view = await open();
    await appRecords(view);
    await view.quiet(true);
    await view.quiet(false);
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(true);
  });

  it.each<[string, Partial<World>]>([
    ['another lane armed', { status: 'recording_elsewhere' }],
    ['another project open', { sameProject: false }],
  ])("a Booth opened again with the DAW stopped forgets the app's take: a later REAPER take on %s is never startedByApp", async (_name, change) => {
    const first = await open();
    await appRecords(first);
    first.hook.unmount();
    // The narrator stops the take in REAPER, and the Booth is opened again.
    first.world.recording = false;
    const second = await open();
    await tick();
    Object.assign(second.world, change);
    await second.dawTake(true);
    await tick();
    expect(second.hook.result.current.recording).toBe(false);
    expect(second.hook.result.current.startedByApp).toBe(true);
  });
});

describe('who started the take (QA B4, B5)', () => {
  it("startedByApp is true again once a REAPER take has ended, and while the app's own start is out", async () => {
    const view = await open();
    await view.dawTake(true);
    expect(view.hook.result.current.startedByApp).toBe(false);
    await view.dawTake(false);
    expect(view.hook.result.current.startedByApp).toBe(true);

    let answer: (result: DawRecordStart) => void = () => {};
    view.recordStart.mockImplementation(() => new Promise<DawRecordStart>((resolve) => (answer = resolve)));
    let press: Promise<boolean> = Promise.resolve(false);
    act(() => void (press = view.hook.result.current.toggle()));
    await settle();
    expect(view.hook.result.current.starting).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(true);
    await act(async () => {
      answer({ ok: true, changed: true, undoSteps: 0, message: '' });
      await press;
    });
  });

  it("a start the press gave up on, answered after REAPER already shows the take, is the app's: the next Stop reaches REAPER (QA B5)", async () => {
    const view = await open();
    let answer: (result: DawRecordStart) => void = () => {};
    view.recordStart.mockImplementation(() => new Promise<DawRecordStart>((resolve) => (answer = resolve)));
    let press: Promise<boolean> = Promise.resolve(false);
    act(() => void (press = view.hook.result.current.toggle()));
    await act(async () => void (await vi.advanceTimersByTimeAsync(11_000)));
    await act(async () => void (await press));
    expect(view.hook.result.current.recording).toBe(false);

    // REAPER shows the take the app sent, before the late answer.
    await view.dawTake(true);
    expect(view.hook.result.current.startedByApp).toBe(false);
    await act(async () => answer({ ok: true, changed: true, undoSteps: 0, message: 'started' }));
    await settle();

    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(true);
    expect(view.recordStop).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 2000);
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.recordStop).toHaveBeenCalledTimes(1);
  });
});

describe('a take is followed only on a read made after it was seen (QA B6, B7, B8, B9)', () => {
  it("no committed render says 'elsewhere' for a take on the chapter's own lane (B6)", async () => {
    const view = await open();
    await tick();
    view.renders.length = 0;
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.renders.filter((render) => render.notFollowed !== null || render.gate === 'recording_elsewhere')).toEqual([]);
  });

  it("a second take in REAPER is not adopted on the first take's stale answer (B7)", async () => {
    const view = await open();
    await view.dawTake(true);
    expect(view.onStarted).toHaveBeenCalledTimes(1);
    view.world.lane = 'hang';
    await view.dawTake(false);
    view.world.status = 'recording_elsewhere';
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.onStarted).toHaveBeenCalledTimes(1);
    view.world.lane = 'live';
    act(() => view.hook.result.current.checkAgain());
    await settle();
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.hook.result.current.notFollowed).toBe('other_track');
  });

  it("the take begins where REAPER's transport said it began, not where the play head is when the reads answer (B8)", async () => {
    const view = await open({ lane: 'hang' });
    await view.dawTake(true);
    view.world.head = 43.2;
    view.world.lane = 'live';
    act(() => view.hook.result.current.checkAgain());
    await settle();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.onStarted).toHaveBeenCalledTimes(1);
    expect(view.onStarted).toHaveBeenCalledWith(expect.objectContaining({ position: 42 }));
  });

  it('a take the Booth stopped following is followed again once the lane answers again; the sentence stays up meanwhile and the take is not said to have ended (QA round 5 B2)', async () => {
    const view = await open();
    await view.dawTake(true);
    const dismiss = vi.spyOn(view.overlay, 'dismissTopic');
    dismiss.mockClear();
    view.world.status = 'recording_elsewhere';
    view.world.armedCount = 2;
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.hook.result.current.stoppedListening).toBe(true);
    // Said, and still up after the render that says it: nothing took it away.
    expect(dismiss).not.toHaveBeenCalledWith('daw-stopped-listening');
    expect(view.notify).not.toHaveBeenCalledWith('The take ended in REAPER.', TAKE_TOPIC);

    view.world.status = 'recording_here';
    view.world.armedCount = 1;
    await tick();
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.stoppedListening).toBe(false);
    expect(view.onStarted).toHaveBeenCalledTimes(2);
    expect(dismiss).toHaveBeenCalledWith('daw-stopped-listening');
    expect(view.recordStop).not.toHaveBeenCalled();
  });

  it('the same for another project opened and closed again (QA round 5 T3b)', async () => {
    const view = await open();
    await view.dawTake(true);
    view.world.sameProject = false;
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.hook.result.current.stoppedListening).toBe(true);
    view.world.sameProject = true;
    await tick();
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
  });

  it('a claim kept across a quiet DAW is not taken back for a take REAPER runs on another lane when it answers again', async () => {
    const view = await open();
    await appRecords(view);
    await view.dawTake(true);
    await view.quiet(true);
    await view.dawTake(false);
    view.world.status = 'recording_elsewhere';
    view.world.recording = true;
    await view.quiet(false);
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.recordStop).not.toHaveBeenCalled();
  });

  it("a claim kept across a left Booth is taken back on the chapter's lane in the linked project, and Stop reaches REAPER", async () => {
    const first = await open();
    await appRecords(first);
    first.hook.unmount();
    const second = await open({ recording: true });
    await tick();
    expect(second.hook.result.current.recording).toBe(true);
    expect(second.hook.result.current.startedByApp).toBe(true);
    vi.setSystemTime(Date.now() + 2000);
    await act(async () => void (await second.hook.result.current.toggle()));
    expect(second.recordStop).toHaveBeenCalledTimes(1);
  });

  it('a press overtaken by a take REAPER started sends no start and leaves the followed take running (R2)', async () => {
    const view = await open();
    let release: () => void = () => {};
    view.world.bootstrapGate = new Promise<void>((resolve) => (release = resolve));
    let press: Promise<boolean> = Promise.resolve(false);
    act(() => void (press = view.hook.result.current.toggle()));
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(true);
    release();
    await act(async () => void (await press));
    expect(view.recordStart).not.toHaveBeenCalled();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(false);
  });

  it('while REAPER records and the lane is unread, Record does not send a start (R3)', async () => {
    const view = await open({ lane: 'hang' });
    await view.dawTake(true);
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.recordStart).not.toHaveBeenCalled();
    expect(view.notify).toHaveBeenCalledWith(expect.stringMatching(/has not yet checked whether it is this chapter's/), 'daw-undecided');
  });

  it('a stopped transport heard before the DAW has answered once does not drop the claim (R4)', async () => {
    const first = await open();
    await appRecords(first);
    first.hook.unmount();
    let answer: () => void = () => {};
    const second = await open({ recording: true, capsGate: new Promise<void>((resolve) => (answer = resolve)) });
    // The idle payload of a DAW that is not answering yet.
    act(() => second.sendTransport({ playing: false, recording: false }));
    second.world.capsGate = null;
    answer();
    await tick();
    await tick();
    expect(second.hook.result.current.recording).toBe(true);
    expect(second.hook.result.current.startedByApp).toBe(true);
  });

  it('after stop-following, a restart heard in one batch is followed (R5)', async () => {
    const view = await open();
    await view.dawTake(true);
    view.world.status = 'recording_elsewhere';
    view.world.armedCount = 2;
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    view.world.status = 'recording_here';
    view.world.armedCount = 1;
    act(() => {
      view.sendTransport({ playing: false, recording: false });
      view.sendTransport({ playing: true, recording: true, position: 50 });
    });
    await settle();
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.onStarted).toHaveBeenCalledTimes(2);
  });

  it('the hook and the leave guard together: a take REAPER started whose end is not confirmed is never asked about as one the app stops (intent B2)', async () => {
    const view = await open();
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(true);
    const guard = createLeaveGuard();
    const guarded = renderHook(
      () => {
        const control = view.hook.result.current;
        return useBoothLeaveGuard(
          {
            recording: control.recording || control.starting,
            startedByApp: control.startedByApp,
            daw: { name: 'REAPER' },
            stopRecording: async () => ({ ok: true, changed: true, undoSteps: 0, message: '' }),
            endUnconfirmed: control.endUnconfirmed,
            endConfirmed: control.endConfirmed,
          },
          { guard, overlay: view.overlay },
        );
      },
      { wrapper: view.wrapper },
    );
    await view.quiet(true);
    await view.dawTake(false);
    guarded.rerender();
    expect(view.hook.result.current.recording).toBe(false);
    const verdict = guard.checkLeave('/script');
    expect(verdict).not.toBe('allow');
    expect(verdict).toMatchObject({ ask: { title: 'Leave the Booth?', confirmLabel: 'Leave', cancelLabel: 'Stay' } });
  });

  it('leaving the Booth takes its take messages and a refused Record with it (walkthrough 13)', async () => {
    const view = await open();
    const dismiss = vi.spyOn(view.overlay, 'dismissTopic');
    dismiss.mockClear();
    view.hook.unmount();
    expect(dismiss).toHaveBeenCalledWith(HELD_TOPIC);
    expect(dismiss).toHaveBeenCalledWith('record-blocked');
  });

  it('a failed read of the transport is said, not waited for for ever (R6)', async () => {
    const view = await open({ quiet: false });
    expect(view.hook.result.current.projectFailed).toBe(false);
    const failing = vi.spyOn(view.api, 'bootstrap');
    failing.mockRestore();
    view.hook.unmount();
    const broken = renderHook(() => useRecordControl({ chapterId: 'c1', notify: vi.fn() }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ApiProvider api={createMockApi()}>
          <PortOverrides
            clients={{
              daw: {
                ...dawClientFor('reaper'),
                projectState: async () => {
                  throw new Error('no answer');
                },
              },
            }}
          >
            <OverlayProvider service={createOverlayService()}>{children}</OverlayProvider>
          </PortOverrides>
        </ApiProvider>
      ),
    });
    await settle();
    expect(broken.result.current.project).toBeNull();
    expect(broken.result.current.projectFailed).toBe(true);
  });
});

describe("the app's claim on its own take is dropped only on a positive answer; every non-answer keeps it (QA round 4)", () => {
  const NO_TRACKS: DawCapabilities = {
    ...QUIET,
    capabilities: { ...QUIET.capabilities, track_state: { level: 'experimental', available: false, reason: 'not_running', message: '' } },
  };
  /** The app's own take, the Booth left with it running, and a Booth opened again over a DAW that still records it. */
  const reopened = async ({ linkFails, ...init }: Partial<World> & { linkFails?: boolean }) => {
    const first = await open();
    await appRecords(first);
    first.hook.unmount();
    if (linkFails) {
      const failing = Promise.reject(new Error('no answer'));
      failing.catch(() => {});
      init.bootstrapGate = failing;
    }
    return open({ recording: true, ...init });
  };
  const takenBack = async (view: Awaited<ReturnType<typeof open>>) => {
    await tick();
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp, "the app's own take was read as REAPER's").toBe(true);
    skipGuard();
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.recordStop).toHaveBeenCalledTimes(1);
  };

  it.each<[string, (view: Awaited<ReturnType<typeof open>>) => Promise<void>, Partial<World> & { linkFails?: boolean }]>([
    ['a lane read that fails', async (view) => void (await tick(), (view.world.lane = 'live')), { lane: 'fail' }],
    ['a lane read that answers unavailable', async (view) => void (await tick(), (view.world.status = 'recording_here')), { status: 'unavailable' }],
    ['a link read that fails', async () => undefined, { linkFails: true }],
    [
      'a quiet event that keeps the track state, while the lane is still being read',
      async (view) => {
        await view.quiet(true);
        view.world.lane = 'live';
        await view.quiet(false);
      },
      { lane: 'hang' },
    ],
    [
      'a quiet event that takes the track state away, while the lane is still being read',
      async (view) => {
        view.world.quiet = true;
        await view.sendCaps(NO_TRACKS);
        await settle();
        view.world.lane = 'live';
        await view.quiet(false);
      },
      { lane: 'hang' },
    ],
  ])('the claim survives %s: the next read that answers takes it back and Stop reaches REAPER', async (_name, then, init) => {
    const view = await reopened(init);
    await then(view);
    await takenBack(view);
  });

  it('a stopped transport from a DAW going quiet, before the capability read answers, keeps the claim', async () => {
    const view = await open();
    await appRecords(view);
    await view.dawTake(true);
    view.world.quiet = true;
    act(() => view.sendTransport({ playing: false, recording: false }));
    await settle();
    expect(view.hook.result.current.recording).toBe(false);
    expect(view.hook.result.current.endUnconfirmed()).toBe(true);
    await view.quiet(false);
    act(() => view.sendTransport({ playing: true, recording: true, position: 50 }));
    await takenBack(view);
  });

  it('the late end confirmation of the previous take does not drop the claim of a take pressed since', async () => {
    const view = await open();
    await view.dawTake(true);
    let answer: () => void = () => {};
    view.world.capsGate = new Promise<void>((resolve) => (answer = resolve));
    await view.dawTake(false);
    await appRecords(view);
    view.world.capsGate = null;
    answer();
    await settle();
    expect(view.hook.result.current.recording).toBe(true);
    view.hook.unmount();
    const second = await open({ recording: true });
    await takenBack(second);
  });

  it('a page for another chapter looking at the take does not drop the claim of the chapter it began in', async () => {
    const first = await open();
    await appRecords(first);
    first.hook.unmount();
    const other = await open({ recording: true, status: 'recording_elsewhere' }, 'c2');
    await tick();
    expect(other.hook.result.current.recording).toBe(false);
    await act(async () => void (await other.hook.result.current.toggle()));
    expect(other.recordStop).not.toHaveBeenCalled();
    other.hook.unmount();
    const back = await open({ recording: true }, 'c1');
    await takenBack(back);
  });

  it("a lane that says recording elsewhere for the claim's own chapter ends the claim: that take is REAPER's and gets no stop", async () => {
    const view = await reopened({ status: 'recording_elsewhere' });
    await tick();
    expect(view.hook.result.current.recording).toBe(false);
    view.world.status = 'recording_here';
    await tick();
    await tick();
    expect(view.hook.result.current.startedByApp).toBe(false);
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.recordStop).not.toHaveBeenCalled();
  });

  it('a press waiting on its project check, overtaken by a REAPER take whose lane is not read yet, sends no start (R2)', async () => {
    const view = await open();
    let release: () => void = () => {};
    view.world.bootstrapGate = new Promise<void>((resolve) => (release = resolve));
    let press: Promise<boolean> = Promise.resolve(false);
    act(() => void (press = view.hook.result.current.toggle()));
    view.world.lane = 'hang';
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(false);
    release();
    await act(async () => void (await press));
    expect(view.recordStart).not.toHaveBeenCalled();
  });
});

describe('the claim is ended outside any Booth, and what is only a stop of listening is not an end (QA round 5)', () => {
  it("a take REAPER started while no Booth was open is REAPER's, on the claim's lane and on another chapter's (B1)", async () => {
    for (const chapter of ['c1', 'c2']) {
      forgetAppTake();
      const first = await open();
      await appRecords(first);
      first.hook.unmount();
      // The take is stopped in REAPER with no Booth open, and REAPER records another.
      await first.dawTake(false);
      await settle();
      const later = await open({ recording: true }, chapter);
      await tick();
      expect(later.hook.result.current.recording, chapter).toBe(true);
      expect(later.hook.result.current.startedByApp, `a take REAPER started is read as the app's (${chapter})`).toBe(false);
      await act(async () => void (await later.hook.result.current.toggle()));
      expect(later.recordStop).not.toHaveBeenCalled();
      later.hook.unmount();
    }
  });

  it('a late end confirmation from a Booth that is gone drops nothing (B4)', async () => {
    const first = await open();
    await first.dawTake(true);
    let answer: () => void = () => {};
    first.world.capsGate = new Promise<void>((resolve) => (answer = resolve));
    await first.dawTake(false);
    first.hook.unmount();
    const second = await open();
    await appRecords(second);
    first.world.capsGate = null;
    answer();
    await settle();
    second.hook.unmount();
    const third = await open({ recording: true });
    await tick();
    await tick();
    expect(third.hook.result.current.recording).toBe(true);
    expect(third.hook.result.current.startedByApp, "the earlier take's late confirmation dropped the claim of the take pressed since").toBe(true);
  });

  it('a transport event is heard when the first project read failed (B3)', async () => {
    const view = await open({ projectFails: true });
    await view.dawTake(true);
    expect(view.hook.result.current.recording).toBe(true);
    expect(view.hook.result.current.startedByApp).toBe(false);
  });

  it('the notice that the lane is not read yet goes when it is: the take is followed (B5)', async () => {
    const view = await open({ lane: 'hang' });
    await view.dawTake(true);
    await act(async () => void (await view.hook.result.current.toggle()));
    expect(view.notify).toHaveBeenCalledWith(expect.stringMatching(/has not yet checked/), 'daw-undecided');
    const dismiss = vi.spyOn(view.overlay, 'dismissTopic');
    dismiss.mockClear();
    view.world.lane = 'live';
    act(() => view.hook.result.current.checkAgain());
    await settle();
    expect(view.hook.result.current.recording).toBe(true);
    expect(dismiss).toHaveBeenCalledWith('daw-undecided');
  });

  it('a lane read that never answers is asked again at the short poll, not the long one (B6)', async () => {
    const view = await open({ lane: 'hang' });
    await view.dawTake(true);
    view.world.lane = 'live';
    await tick();
    expect(view.hook.result.current.recording).toBe(true);
  });
});
