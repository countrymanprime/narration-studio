// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { PassageMapApi, PassageMarkInput } from '../../../api/contracts/passageMap';
import type { NarrationApi } from '../../../types';
import { usePassageMapWriter, type PassageMapWriterDeps } from './usePassageMapWriter';

const at = (pid: string, word: number) => ({ pid, word });

function setup(over: { recordRun?: PassageMapApi['passageMapRecordRun']; current?: PassageMapWriterDeps['current'] } = {}) {
  const base = createMockApi();
  const calls: Array<{ chapterId: string; run: PassageMarkInput[] }> = [];
  const recordRun = vi.fn<PassageMapApi['passageMapRecordRun']>(async (chapterId, run) => {
    calls.push({ chapterId, run });
    return over.recordRun ? over.recordRun(chapterId, run) : [];
  });
  const api: NarrationApi = { ...base, passageMapRecordRun: recordRun };
  const notify = vi.fn();
  const current = over.current ?? (() => ({ at: at('p1', 4), elapsed: 9 }));
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => usePassageMapWriter({ chapterId: 'c1', current, notify }), { wrapper });
  return { writer: () => hook.result.current, calls, recordRun, notify };
}

describe('usePassageMapWriter', () => {
  it('a-take-writes-start-and-stop: one run per take, sent once at stop', async () => {
    const { writer, calls, recordRun } = setup();
    act(() => writer().begin(at('p1', 0), 0));
    expect(recordRun).not.toHaveBeenCalled();
    await act(() => writer().stop(at('p1', 7), 12));
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({
      chapterId: 'c1',
      run: [
        { kind: 'start', pid: 'p1', word: 0, sec: 0 },
        { kind: 'stop', pid: 'p1', word: 7, sec: 12, prev: at('p1', 7) },
      ],
    });
  });

  it('a-roll-writes-a-roll-mark: rolling adds a roll with prev the place the take had reached', async () => {
    const { writer, calls } = setup();
    act(() => writer().begin(at('p1', 0), 0));
    act(() => writer().roll(at('p1', 3), at('p2', 2), 5));
    await act(() => writer().stop(at('p2', 1), 8));
    expect(calls[0].run.map((m) => m.kind)).toEqual(['start', 'roll', 'stop']);
    expect(calls[0].run[1]).toEqual({ kind: 'roll', pid: 'p1', word: 3, sec: 5, prev: at('p2', 2) });
  });

  it('a-roll-writes-a-roll-mark: a roll that was never made (refused, or answered no) writes nothing', async () => {
    const { writer, calls } = setup();
    act(() => writer().begin(at('p1', 0), 0));
    // The caller does not call roll() when the host refused or the narrator said no.
    await act(() => writer().stop(at('p1', 2), 3));
    expect(calls[0].run.map((m) => m.kind)).toEqual(['start', 'stop']);
  });

  it('a-roll-writes-a-roll-mark: a roll with no take running writes nothing', async () => {
    const { writer, recordRun } = setup();
    act(() => writer().roll(at('p1', 3), at('p1', 5), 5));
    await act(() => writer().stop(at('p1', 5), 6));
    expect(recordRun).not.toHaveBeenCalled();
  });

  it('seconds-are-take-time-plus-the-start-offset: not wall clock', async () => {
    const { writer, calls } = setup();
    act(() => writer().begin(at('p1', 0), 120));
    act(() => writer().roll(at('p1', 3), at('p1', 6), 5));
    await act(() => writer().stop(at('p1', 9), 10));
    expect(calls[0].run.map((m) => m.sec)).toEqual([120, 125, 130]);
  });

  it('a-failed-write-never-loses-the-take: toasts the sentence once, keeps the run, retries on the next stop', async () => {
    let failing = true;
    const { writer, calls, notify } = setup({
      recordRun: async () => {
        if (failing) throw new Error('that paragraph is not in this chapter');
        return [];
      },
    });
    act(() => writer().begin(at('p1', 0), 0));
    await act(() => writer().stop(at('p1', 2), 4));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('that paragraph is not in this chapter', 'error');

    failing = false;
    act(() => writer().begin(at('p2', 0), 4));
    await act(() => writer().stop(at('p2', 1), 6));
    expect(notify).toHaveBeenCalledTimes(1);
    // The first take's run is sent again before the second's, in the order they were recorded.
    expect(calls.map((c) => c.run[0].pid)).toEqual(['p1', 'p1', 'p2']);
    expect(calls[1].run).toEqual(calls[0].run);
  });

  it('a-leave-mid-take-flushes-the-run: flush() stops the open run at the current place and writes it', async () => {
    const { writer, calls } = setup({ current: () => ({ at: at('p2', 3), elapsed: 20 }) });
    act(() => writer().begin(at('p1', 0), 10));
    await act(() => writer().flush());
    expect(calls).toHaveLength(1);
    expect(calls[0].run[1]).toEqual({ kind: 'stop', pid: 'p2', word: 3, sec: 30, prev: at('p2', 3) });
    await act(() => writer().flush());
    expect(calls).toHaveLength(1);
  });

  it('a-leave-mid-take-flushes-the-run: flush() also retries a run an earlier stop could not write', async () => {
    let failing = true;
    const { writer, calls } = setup({
      recordRun: async () => {
        if (failing) throw new Error('no');
        return [];
      },
    });
    act(() => writer().begin(at('p1', 0), 0));
    await act(() => writer().stop(at('p1', 2), 4));
    failing = false;
    await act(() => writer().flush());
    expect(calls).toHaveLength(2);
  });

  it('the-run-id-is-stable: one take is one run; a new take starts a new run', async () => {
    const { writer, calls } = setup();
    act(() => writer().begin(at('p1', 0), 0));
    act(() => writer().roll(at('p1', 3), at('p1', 6), 5));
    await act(() => writer().stop(at('p1', 9), 10));
    act(() => writer().begin(at('p2', 0), 10));
    await act(() => writer().stop(at('p2', 2), 4));
    expect(calls.map((c) => c.run.map((m) => m.kind))).toEqual([
      ['start', 'roll', 'stop'],
      ['start', 'stop'],
    ]);
    expect(calls.every((c) => c.chapterId === 'c1')).toBe(true);
  });

  it('keeps marks in time order and inside the day the host accepts', async () => {
    const { writer, calls } = setup();
    act(() => writer().begin(at('p1', 0), 100));
    await act(() => writer().stop(at('p1', 2), -5));
    expect(calls[0].run.map((m) => m.sec)).toEqual([100, 100]);
  });
});
