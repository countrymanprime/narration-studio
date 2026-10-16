// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { POLL_MS, useRecordControl } from './useRecordControl';

// Step 0 of the Booth resiliency pass: the launcher notice stayed up, Record stayed off, and nothing said why. These drive the live
// plumbing under it with a DAW whose answers the test controls, one dependency state at a time (definition-of-done, "Talking to an integration").

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const base = DAW_SETUPS.reaper;
const refused = (reason: 'standalone' | 'not_running'): DawCapabilities => ({
  ...base,
  reachable: false,
  capabilities: { ...base.capabilities, record: { level: 'experimental', available: false, reason, message: `refused: ${reason}` } },
});
const CONNECTED = base;

/** A DAW whose current picture the test sets, whose reads can fail or hang, and whose events the test sends by hand. */
function liveDaw(initial: DawCapabilities | 'fail') {
  let truth: DawCapabilities | 'fail' = initial;
  let emit: (next: DawCapabilities) => void = () => {};
  const reads = { count: 0, hold: null as null | Promise<void> };
  const client: DawClient = {
    ...dawClientFor('reaper'),
    capabilities: async () => {
      reads.count += 1;
      const answer = truth;
      if (reads.hold) await reads.hold;
      if (answer === 'fail') throw new Error('the host did not answer');
      return answer;
    },
    subscribeCapabilities: (listener) => ((emit = listener), () => {}),
    recordStart: async () => {
      throw new Error('the host went away');
    },
  };
  return { client, reads, set: (next: DawCapabilities | 'fail') => (truth = next), emit: (next: DawCapabilities) => emit(next) };
}

function mount(initial: DawCapabilities | 'fail', api = createMockApi()) {
  const daw = liveDaw(initial);
  const notify = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: daw.client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return { ...daw, notify, ...renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper }) };
}

describe('Record follows the DAW through every way the heartbeat can go wrong', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('the heartbeat arrives as an event: Record enables', async () => {
    const daw = mount(refused('standalone'));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    act(() => daw.emit(CONNECTED));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
  });

  it('the event is dropped: the next timed read still enables Record', async () => {
    const daw = mount(refused('standalone'));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    daw.set(CONNECTED);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS + 50));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
  });

  it('the event is dropped and the window is focused again: Record enables without waiting for the timer', async () => {
    const daw = mount(refused('not_running'));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    daw.set(CONNECTED);
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
  });

  it('Check again forces a fresh read and says when it last looked', async () => {
    const daw = mount(refused('standalone'));
    await waitFor(() => expect(daw.result.current.checkedAt).not.toBeNull());
    const before = daw.reads.count;
    daw.set(CONNECTED);
    act(() => daw.result.current.checkAgain());
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    expect(daw.reads.count).toBeGreaterThan(before);
  });

  it('a read that started before an event and answers after it does not undo the event', async () => {
    let release: () => void = () => {};
    const daw = mount(refused('standalone'));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    daw.reads.hold = new Promise<void>((resolve) => (release = resolve));
    act(() => daw.result.current.checkAgain());
    act(() => daw.emit(CONNECTED));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    release();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(daw.result.current.disabled).toBe(false);
  });

  it('the same event twice changes nothing', async () => {
    const daw = mount(refused('standalone'));
    act(() => daw.emit(CONNECTED));
    act(() => daw.emit(CONNECTED));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    expect(daw.result.current.reason).toBe('');
  });

  it('the DAW goes quiet after it was ready: Record turns off and says why, and comes back on the next heartbeat', async () => {
    const daw = mount(CONNECTED);
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    act(() => daw.emit(refused('not_running')));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    expect(daw.result.current.reason).toMatch(/not_running/);
    act(() => daw.emit(CONNECTED));
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
  });

  it('the first read fails: Record is not silently on, and the narrator is told it cannot tell', async () => {
    const daw = mount('fail');
    await waitFor(() => expect(daw.result.current.readFailed).toBe(true));
    expect(daw.result.current.disabled).toBe(true);
    expect(daw.result.current.reason).toMatch(/can.t tell/i);
    expect(daw.result.current.reason).toMatch(/Check again/);
  });

  it('a later read fails: the last answer is kept but is no longer given as fact', async () => {
    const daw = mount(CONNECTED);
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    daw.set('fail');
    act(() => daw.result.current.checkAgain());
    await waitFor(() => expect(daw.result.current.readFailed).toBe(true));
    expect(daw.result.current.reason).toMatch(/can.t tell.*last heard \d+ s ago/i);
    daw.set(CONNECTED);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS + 50));
    await waitFor(() => expect(daw.result.current.readFailed).toBe(false));
    expect(daw.result.current.reason).toBe('');
  });

  it('a Record press the host fails on is shown, not swallowed', async () => {
    const daw = mount(CONNECTED);
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    await act(() => daw.result.current.toggle());
    expect(daw.result.current.recording).toBe(false);
    expect(daw.result.current.reason).toMatch(/host went away/);
  });

  it('stops asking on a timer once Record is available, so a working Booth does not poll', async () => {
    const daw = mount(CONNECTED);
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
    const settled = daw.reads.count;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(daw.reads.count).toBe(settled);
  });
});

describe('Record against the project the DAW has open', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  const link = async (facts: { dawFileLinked: boolean; dawReachable: boolean; dawProjectMatches: boolean }) => ({
    ...(await createMockApi().bootstrap()),
    ...facts,
  });
  const apiWith = (facts: Parameters<typeof link>[0] | 'fail') =>
    createMockApi({ bootstrap: async () => (facts === 'fail' ? Promise.reject(new Error('no answer')) : link(facts)) } as Partial<NarrationApi>);

  it('a different project open in the DAW than the linked one: Record is off and says so, naming the way out', async () => {
    const daw = mount(CONNECTED, apiWith({ dawFileLinked: true, dawReachable: true, dawProjectMatches: false }));
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    expect(daw.result.current.reason).toMatch(/different project/i);
    expect(daw.result.current.reason).toMatch(/link|open/i);
  });

  it('the linked project is the open one: Record is on', async () => {
    const daw = mount(CONNECTED, apiWith({ dawFileLinked: true, dawReachable: true, dawProjectMatches: true }));
    await waitFor(() => expect(daw.result.current.facts.dawFileLinked).toBe(true));
    expect(daw.result.current.disabled).toBe(false);
  });

  it('nothing is linked or the DAW is not heard yet: "does not match" is unknown, not a refusal', async () => {
    for (const facts of [
      { dawFileLinked: false, dawReachable: true, dawProjectMatches: false },
      { dawFileLinked: true, dawReachable: false, dawProjectMatches: false },
    ]) {
      const daw = mount(CONNECTED, apiWith(facts));
      await waitFor(() => expect(daw.result.current.capabilities).not.toBeNull());
      await act(() => vi.advanceTimersByTimeAsync(20));
      expect(daw.result.current.disabled).toBe(false);
      daw.unmount();
    }
  });

  it('the link state cannot be read: Record is not refused for it, and the failure is exposed', async () => {
    const daw = mount(CONNECTED, apiWith('fail'));
    await waitFor(() => expect(daw.result.current.factsFailed).toBe(true));
    expect(daw.result.current.disabled).toBe(false);
  });

  it('the narrator opens the right project: the next read lifts the refusal', async () => {
    let matches = false;
    const api = createMockApi({
      bootstrap: async () => link({ dawFileLinked: true, dawReachable: true, dawProjectMatches: matches }),
    } as Partial<NarrationApi>);
    const daw = mount(CONNECTED, api);
    await waitFor(() => expect(daw.result.current.disabled).toBe(true));
    matches = true;
    act(() => daw.result.current.checkAgain());
    await waitFor(() => expect(daw.result.current.disabled).toBe(false));
  });
});
