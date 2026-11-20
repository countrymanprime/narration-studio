// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import type { ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { forgetAppTake, POLL_MS, useRecordControl } from './useRecordControl';

// #3666: "If the right project is open and the right chapter is armed, the app must treat it properly and start listening, even when the take was
// started in the DAW." The take is REAPER's own (the narrator pressed Record there); the Booth adopts it as its running take when the linked project
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
  /** Whether the linked project is the open one. */
  sameProject: boolean;
  quiet: boolean;
};

async function open(init: Partial<World> = {}) {
  const world: World = { recording: false, status: 'recording_here', sameProject: true, quiet: false, ...init };
  const transportListeners = new Set<(next: DawTransport) => void>();
  const sendTransport = (next: DawTransport) => transportListeners.forEach((listener) => listener(next));
  let sendCapabilities: (next: DawCapabilities) => void = () => {};
  const available = DAW_SETUPS.reaper;
  const recordStop = vi.fn(async () => ({ ok: true, changed: true, undoSteps: 0, message: 'stopped' }));
  const recordStart = vi.fn(async () => ({ ok: true, changed: true, undoSteps: 0, message: 'started' }));
  const client: DawClient = {
    ...dawClientFor('reaper'),
    capabilities: async () => available,
    subscribeCapabilities: (listener) => ((sendCapabilities = listener), () => {}),
    subscribeTransport: (listener) => (transportListeners.add(listener), () => void transportListeners.delete(listener)),
    projectState: async (): Promise<DawProjectState> => ({
      savedAt: null,
      unsavedChanges: false,
      playState: world.recording ? 'recording' : 'stopped',
      playPosition: world.recording ? 42 : 0,
    }),
    recordStart,
    recordStop,
  };
  const api = createMockApi({
    bootstrap: async () => ({ ...(await createMockApi().bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: world.sameProject }),
    readAloudReaperState: async () => ({
      status: world.recording ? world.status : 'ready',
      message: '',
      trackGuid: '{T}',
      playing: world.recording,
      recording: world.recording,
    }),
  } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  const notify = vi.fn();
  const onStarted = vi.fn();
  const hook = renderHook(() => useRecordControl({ chapterId: 'c1', notify, onStarted }), { wrapper });
  await settle();
  /** The narrator presses Record (or Stop) in the DAW itself: the DAW's truth changes and says so. */
  const dawTake = async (on: boolean) => {
    world.recording = on;
    act(() => sendTransport({ playing: on, recording: on, position: on ? 42 : undefined }));
    await settle();
  };
  return { world, hook, notify, onStarted, recordStop, recordStart, dawTake, sendCapabilities: (next: DawCapabilities) => act(() => sendCapabilities(next)) };
}

describe('a take started in the DAW (#3666)', () => {
  it("is the Booth's running take when the right project is open and the chapter's lane is the one armed, and the DAW is not touched", async () => {
    const { hook, dawTake, recordStop, recordStart, onStarted } = await open();
    expect(hook.result.current.recording).toBe(false);

    await dawTake(true);

    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
    expect(hook.result.current.gate).toBeNull();
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ position: 42 }));
    expect(recordStop).not.toHaveBeenCalled();
    expect(recordStart).not.toHaveBeenCalled();
  });

  it('is found at once when the take began before the Booth connected', async () => {
    const { hook } = await open({ recording: true });
    await tick();
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
  });

  it('is not adopted with another project open: Record says so and nothing follows', async () => {
    const { hook, dawTake } = await open({ sameProject: false });
    await dawTake(true);
    await tick();
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.disabled).toBe(true);
    expect(hook.result.current.reason).not.toBe('');
  });

  it.each<ReadAloudReaperStatus>(['recording_elsewhere', 'no_link', 'unavailable'])('is not adopted when the host says %s', async (status) => {
    const { hook, dawTake } = await open({ status });
    await dawTake(true);
    await tick();
    expect(hook.result.current.recording).toBe(false);
  });

  it('Stop on it asks the DAW nothing and says it stops there; the end of the chapter ends nothing in the DAW and says nothing', async () => {
    const { hook, dawTake, recordStop, notify } = await open();
    await dawTake(true);

    let stopped = true;
    await act(async () => void (stopped = await hook.result.current.toggle()));
    expect(stopped).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/started this take.*stop it in REAPER/i));
    notify.mockClear();

    await act(async () => void (await hook.result.current.toggle(undefined, { automatic: true })));
    expect(notify).not.toHaveBeenCalled();
    expect(recordStop).not.toHaveBeenCalled();
    expect(hook.result.current.recording).toBe(true);
  });

  it('ends when REAPER stops it, and the next take in REAPER is adopted again', async () => {
    const { hook, dawTake, notify } = await open();
    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);

    await dawTake(false);
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.startedByApp).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/REAPER stopped recording/), expect.anything());

    await dawTake(true);
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(false);
  });

  it("a take the Booth pressed itself stays the app's", async () => {
    const { hook, world, recordStart, dawTake } = await open();
    recordStart.mockImplementation(async () => {
      world.recording = true;
      return { ok: true, changed: true, undoSteps: 0, message: 'started' };
    });
    await act(async () => void (await hook.result.current.toggle()));
    expect(hook.result.current.recording).toBe(true);
    expect(hook.result.current.startedByApp).toBe(true);
    // The transport event for its own start is the press's, not a DAW-started take.
    await dawTake(true);
    expect(hook.result.current.startedByApp).toBe(true);
  });
});
