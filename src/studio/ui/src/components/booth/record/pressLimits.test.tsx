// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient, DawRecordStart } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { dawClientFor } from './fixtures';
import { logUi } from '../../../api/uiLog';
import { limited, PRESS_LIMITS_MS } from './pressLimits';
import { forgetAppTake, useRecordControl } from './useRecordControl';

vi.mock('../../../api/uiLog', () => ({ logUi: vi.fn() }));

// #3321: every wait in a Record press ends. These drive the Record control with a host whose calls the test holds, answers late or never answers,
// and check that Record is free afterwards, one honest sentence was said and no take is left running behind it.

beforeEach(() => {
  forgetAppTake();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OK: DawRecordStart = { ok: true, changed: true, message: '', undoSteps: 0 } as DawRecordStart;

function mount(options: { start?: DawClient['recordStart']; bootstrap?: NarrationApi['bootstrap']; setup?: 'reaper' | 'builtin' } = {}) {
  const stops = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const client: DawClient = {
    ...dawClientFor(options.setup ?? 'reaper'),
    ...(options.start ? { recordStart: options.start } : {}),
    recordStop: stops as unknown as DawClient['recordStop'],
  };
  const api = createMockApi(options.bootstrap ? ({ bootstrap: options.bootstrap } as Partial<NarrationApi>) : {});
  const notify = vi.fn();
  const onBlocked = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  const view = renderHook(() => useRecordControl({ chapterId: 'c1', notify, onBlocked }), { wrapper });
  return { ...view, stops, onBlocked, client };
}

const ready = async (view: ReturnType<typeof mount>) => {
  await waitFor(() => expect(view.result.current.capabilities).not.toBeNull());
  expect(DAW_SETUPS.reaper.reachable).toBe(true);
};

describe('the run log', () => {
  it('names the stage that hit its limit, and when it answered late', async () => {
    let release: (v: number) => void = () => {};
    const out = limited('projectCheck', new Promise<number>((r) => (release = r)));
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.projectCheck + 1);
    await out;
    expect(logUi).toHaveBeenCalledWith('ui.record.limit', expect.stringContaining('stage=projectCheck'));
    release(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(logUi).toHaveBeenCalledWith('ui.record.limit', expect.stringContaining('stage=projectCheck answered after its limit'));
  });
});

describe('limited', () => {
  it('answers in time: the value, no late call', async () => {
    const late = vi.fn();
    const out = limited('modelCheck', Promise.resolve(3), late);
    await expect(out).resolves.toEqual({ timedOut: false, value: 3 });
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck + 1);
    expect(late).not.toHaveBeenCalled();
  });
  it('never answers: timed out at its limit, not before', async () => {
    let state = 'waiting';
    void limited('modelCheck', new Promise(() => {})).then((r) => (state = r.timedOut ? 'over' : 'value'));
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.modelCheck - 1);
    expect(state).toBe('waiting');
    await vi.advanceTimersByTimeAsync(2);
    expect(state).toBe('over');
  });
  it('answers late: the late handler gets it once', async () => {
    const late = vi.fn();
    let release: (v: number) => void = () => {};
    const out = limited('recordStart', new Promise<number>((r) => (release = r)), late);
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 1);
    await expect(out).resolves.toEqual({ timedOut: true });
    release(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(late).toHaveBeenCalledExactlyOnceWith(7);
  });
  it('fails in time: rejects as the call did; failing after the limit is dropped quietly', async () => {
    await expect(limited('voiceChoice', Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    let fail: (e: Error) => void = () => {};
    const out = limited('voiceChoice', new Promise((_, r) => (fail = r)));
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.voiceChoice + 1);
    await expect(out).resolves.toEqual({ timedOut: true });
    fail(new Error('late boom'));
    await vi.advanceTimersByTimeAsync(1);
  });
});

describe('the project check before a start', () => {
  it('never answers: the press ends at its limit with a sentence, nothing is started, and Record is free for the next press', async () => {
    const start = vi.fn(async () => OK);
    let hang = false;
    const view = mount({
      start,
      bootstrap: () => {
        // Hung once, for the press: the Booth's own reads of the link before it are not the press's.
        const held = hang;
        hang = false;
        return held ? new Promise(() => {}) : createMockApi().bootstrap();
      },
    });
    await ready(view);
    await act(() => vi.advanceTimersByTimeAsync(50));
    hang = true;
    let pressed: Promise<boolean> = Promise.resolve(true);
    act(() => void (pressed = view.result.current.toggle()));
    await act(() => vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.projectCheck + 5));
    await expect(pressed).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(view.onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringMatching(/did not answer in time, so no take was started/) }));
    expect(view.result.current.starting).toBe(false);
    // The next press asks the host again and goes through.
    await act(async () => void (await view.result.current.toggle()));
    expect(start).toHaveBeenCalledTimes(1);
    expect(view.result.current.recording).toBe(true);
  });
});

describe('the host start of the take', () => {
  it('never answers: Record is free at the limit with one sentence, and no stop is sent while nothing started', async () => {
    const view = mount({ start: () => new Promise(() => {}) });
    await ready(view);
    let pressed: Promise<boolean> = Promise.resolve(true);
    act(() => void (pressed = view.result.current.toggle()));
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart - 100);
    expect(view.result.current.starting).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(200));
    await expect(pressed).resolves.toBe(false);
    expect(view.result.current.starting).toBe(false);
    expect(view.result.current.recording).toBe(false);
    expect(view.onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringMatching(/did not answer the start in time/) }));
    expect(view.stops).not.toHaveBeenCalled();
  });

  it('answers after the limit with a take: that take is stopped, once, and the Booth does not read as recording', async () => {
    let release: (r: DawRecordStart) => void = () => {};
    const view = mount({ start: () => new Promise((r) => (release = r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    await act(async () => release(OK));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.stops).toHaveBeenCalledTimes(1);
    expect(view.result.current.recording).toBe(false);
  });

  it('answers after the limit with a refusal: nothing is stopped', async () => {
    let release: (r: DawRecordStart) => void = () => {};
    const view = mount({ start: () => new Promise((r) => (release = r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    await act(async () => release({ ok: false, changed: false, message: 'no', undoSteps: 0 } as DawRecordStart));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.stops).not.toHaveBeenCalled();
  });

  it("the app's own recorder may take up to its host limit (20 s): a start answering at 15 s is the take, not a refusal", async () => {
    const view = mount({ setup: 'builtin', start: () => new Promise((r) => setTimeout(() => r(OK), 15_000)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await act(() => vi.advanceTimersByTimeAsync(15_100));
    expect(view.result.current.recording).toBe(true);
    expect(view.stops).not.toHaveBeenCalled();
  });

  it('fails: the failure sentence as before, Record free (a regression test: it passes on main too)', async () => {
    const view = mount({ start: async () => Promise.reject(new Error('the host went away')) });
    await ready(view);
    await act(async () => void (await view.result.current.toggle()));
    expect(view.onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringMatching(/Record did not start: the host went away/) }));
    expect(view.result.current.starting).toBe(false);
  });

  it('pressed again after the limit, the first answers late with a take while the second is out: the second press owns it, nothing is stopped', async () => {
    const answers: Array<(r: DawRecordStart) => void> = [];
    const view = mount({ start: () => new Promise((r) => answers.push(r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(5);
    expect(answers).toHaveLength(2);
    // The host serves them in order: the first answers late, then the second.
    await act(async () => answers[0]!(OK));
    await act(async () => answers[1]!(OK));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.result.current.recording).toBe(true);
    expect(view.stops).not.toHaveBeenCalled();
  });

  it("the second press's answer lands outside a render: the late take of the first is still not stopped (the Booth reads the answer, not a render)", async () => {
    const answers: Array<(r: DawRecordStart) => void> = [];
    const view = mount({ start: () => new Promise((r) => answers.push(r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(5);
    // Both answers arrive with no render in between (no act): what the Booth knows is what the presses answered.
    answers[0]!(OK);
    answers[1]!(OK);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.stops).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(view.result.current.recording).toBe(true);
  });

  it('pressed again after the limit and that press is refused, the first answering late with a take: the take is stopped', async () => {
    const answers: Array<(r: DawRecordStart) => void> = [];
    const view = mount({ start: () => new Promise((r) => answers.push(r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(5);
    await act(async () => answers[0]!(OK));
    await act(async () => answers[1]!({ ok: false, changed: false, message: 'busy', undoSteps: 0 } as DawRecordStart));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.result.current.recording).toBe(false);
    expect(view.stops).toHaveBeenCalledTimes(1);
  });

  it('the Booth is left after the limit and the start answers late with a take: it is stopped', async () => {
    let release: (r: DawRecordStart) => void = () => {};
    const view = mount({ start: () => new Promise((r) => (release = r)) });
    await ready(view);
    act(() => void view.result.current.toggle());
    await vi.advanceTimersByTimeAsync(PRESS_LIMITS_MS.recordStart + 5);
    view.unmount();
    await act(async () => release(OK));
    await vi.advanceTimersByTimeAsync(10);
    expect(view.stops).toHaveBeenCalledTimes(1);
  });
});
