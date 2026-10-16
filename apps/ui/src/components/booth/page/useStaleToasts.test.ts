// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createOverlayService } from '../../../overlay/overlayService';
import { useStaleToasts } from './useStaleToasts';

const texts = (service: ReturnType<typeof createOverlayService>) => service.getSnapshot().toasts.map((t) => t.text);

// A message the Booth said about Record that stopped being true must not sit on the screen: "REAPER is starting" after REAPER answered,
// or a refusal after Record came back (Booth pass 3, items M2, M3 and 9).
describe('useStaleToasts', () => {
  it('takes away what the setup notice said once Record is ready', () => {
    const overlay = createOverlayService();
    const { rerender } = renderHook(({ ready, reason }) => useStaleToasts(overlay, { ready, reason }), {
      initialProps: { ready: false, reason: 'REAPER is not answering.' },
    });
    act(() => overlay.toast('REAPER is starting (C:\\reaper.exe). Record turns on here once it connects.', { topic: 'daw-setup' }));
    act(() => overlay.toast('Something unrelated.'));
    expect(texts(overlay)).toHaveLength(2);
    rerender({ ready: true, reason: '' });
    expect(texts(overlay)).toEqual(['Something unrelated.']);
  });

  it('takes away a refusal the narrator was shown once that refusal is gone, and only that refusal', () => {
    const overlay = createOverlayService();
    const { rerender } = renderHook(({ ready, reason }) => useStaleToasts(overlay, { ready, reason }), {
      initialProps: { ready: false, reason: 'REAPER is not answering.' },
    });
    act(() => overlay.toast('REAPER is not answering.'));
    act(() => overlay.toast('Rolling again from ¶ 3'));
    rerender({ ready: false, reason: 'REAPER has a different project open.' });
    act(() => overlay.toast('REAPER has a different project open.'));
    rerender({ ready: true, reason: '' });
    expect(texts(overlay)).toEqual(['Rolling again from ¶ 3']);
  });

  it('leaves a toast alone while the reason it names still stands', () => {
    const overlay = createOverlayService();
    const { rerender } = renderHook(({ ready, reason }) => useStaleToasts(overlay, { ready, reason }), {
      initialProps: { ready: false, reason: 'No microphone.' },
    });
    act(() => overlay.toast('No microphone.'));
    rerender({ ready: false, reason: 'No microphone.' });
    expect(texts(overlay)).toEqual(['No microphone.']);
  });

  it('a reason that comes back is shown again, not taken as stale before it is said', () => {
    const overlay = createOverlayService();
    const { rerender } = renderHook(({ ready, reason }) => useStaleToasts(overlay, { ready, reason }), { initialProps: { ready: true, reason: '' } });
    rerender({ ready: false, reason: 'REAPER is not answering.' });
    act(() => overlay.toast('REAPER is not answering.'));
    rerender({ ready: true, reason: '' });
    expect(texts(overlay)).toEqual([]);
    rerender({ ready: false, reason: 'REAPER is not answering.' });
    act(() => overlay.toast('REAPER is not answering.'));
    expect(texts(overlay)).toEqual(['REAPER is not answering.']);
  });
});
