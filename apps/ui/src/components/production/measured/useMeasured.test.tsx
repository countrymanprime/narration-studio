// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMockMeasurements, type MeasurementsPort } from '../../../ports/measurements';
import { useMeasured } from './useMeasured';

describe('useMeasured', () => {
  it('hook-reads-once-and-on-change', async () => {
    const a = createMockMeasurements();
    const takeLog = vi.spyOn(a, 'takeLog');
    const { result, rerender } = renderHook(({ port }) => useMeasured(port, 'USB microphone', ['c3a']), { initialProps: { port: a as MeasurementsPort } });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.answers?.roomTone).toEqual({ ok: true, value: -58.6 });
    expect(takeLog).toHaveBeenCalledTimes(1);

    act(() => result.current.refresh());
    expect(result.current.status).toBe('ready'); // keeps the last answer while re-reading
    await waitFor(() => expect(takeLog).toHaveBeenCalledTimes(2));

    rerender({ port: createMockMeasurements({ none: true }) });
    await waitFor(() => expect(result.current.answers?.roomTone.ok).toBe(false));
  });

  it('turns a refused read into a reason', async () => {
    const port: MeasurementsPort = {
      ...createMockMeasurements(),
      takeLog: () => Promise.reject(new Error('boom')),
      roomTone: () => {
        throw new Error('sync');
      },
    };
    const { result } = renderHook(() => useMeasured(port, 'm', []));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.answers?.takeLog).toEqual({ ok: false, reason: 'boom' });
    expect(result.current.answers?.roomTone).toEqual({ ok: false, reason: 'sync' });
  });
});
