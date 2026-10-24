// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Measured } from '../../../api/schemas/base';
import { ROOM_TONE_READ_MS, useRoomTone } from './BoothFooter';

/** A port whose kept room tone the test changes, as a capture would on the host. */
function hostPort(kept: Record<string, number>) {
  const roomTone = vi.fn(async (mic: string): Promise<Measured<number>> => (mic in kept ? { ok: true, value: kept[mic] } : { ok: false, reason: 'none' }));
  return { roomTone, kept };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useRoomTone', () => {
  it('shows a room tone measured after the Booth opened, at the next read (the Levels menu measured it)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const port = hostPort({});
    const { result } = renderHook(() => useRoomTone(port, 'USB Mic'));
    await waitFor(() => expect(port.roomTone).toHaveBeenCalled());
    expect(result.current).toEqual({ label: 'Room not measured yet', ok: false });
    port.kept['USB Mic'] = -58.6;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_TONE_READ_MS);
    });
    await waitFor(() => expect(result.current).toEqual({ label: 'Room −58.6 dB', ok: true }));
  });

  it('reads again when the window regains focus', async () => {
    const port = hostPort({ 'USB Mic': -60 });
    const { result } = renderHook(() => useRoomTone(port, 'USB Mic'));
    await waitFor(() => expect(result.current.label).toBe('Room −60.0 dB'));
    port.kept['USB Mic'] = -52.25;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.label).toBe('Room −52.3 dB'));
  });

  it('keeps the last value on screen while the next read is on its way, and after the capture ends', async () => {
    let answer: (tone: Measured<number>) => void = () => {};
    const roomTone = vi.fn().mockResolvedValueOnce({ ok: true, value: -58.6 });
    const port = { roomTone };
    const { result } = renderHook(() => useRoomTone(port, 'USB Mic'));
    await waitFor(() => expect(result.current.ok).toBe(true));
    roomTone.mockImplementationOnce(() => new Promise<Measured<number>>((resolve) => (answer = resolve)));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toEqual({ label: 'Room −58.6 dB', ok: true });
    await act(async () => answer({ ok: true, value: -58.6 }));
    expect(result.current).toEqual({ label: 'Room −58.6 dB', ok: true });
  });

  it("never shows one microphone's room tone for another", async () => {
    const port = hostPort({ 'USB Mic': -58.6 });
    const { result, rerender } = renderHook(({ mic }) => useRoomTone(port, mic), { initialProps: { mic: 'USB Mic' } });
    await waitFor(() => expect(result.current.ok).toBe(true));
    rerender({ mic: 'Desk Mic' });
    expect(result.current).toEqual({ label: 'Room not measured yet', ok: false });
    await waitFor(() => expect(port.roomTone).toHaveBeenLastCalledWith('Desk Mic'));
    expect(result.current.ok).toBe(false);
  });

  it('a read that fails says the room tone is unavailable, and the next read recovers', async () => {
    let up = false;
    const roomTone = vi.fn(async (): Promise<Measured<number>> => {
      if (!up) throw new Error('the teleprompter service is unavailable');
      return { ok: true, value: -61 };
    });
    const { result } = renderHook(() => useRoomTone({ roomTone }, 'USB Mic'));
    await waitFor(() => expect(roomTone).toHaveBeenCalled());
    await Promise.allSettled(roomTone.mock.results.map((r) => r.value));
    await waitFor(() => expect(result.current).toEqual({ label: 'Room tone unavailable', ok: false }));
    up = true;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.label).toBe('Room −61.0 dB'));
  });

  it('stops reading once the Booth closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const port = hostPort({});
    const { unmount } = renderHook(() => useRoomTone(port, 'USB Mic'));
    await waitFor(() => expect(port.roomTone).toHaveBeenCalled());
    unmount();
    const reads = port.roomTone.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ROOM_TONE_READ_MS * 3);
    window.dispatchEvent(new Event('focus'));
    expect(port.roomTone).toHaveBeenCalledTimes(reads);
  });
});
