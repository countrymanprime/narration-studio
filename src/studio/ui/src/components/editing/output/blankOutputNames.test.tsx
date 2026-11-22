// @vitest-environment jsdom
// The Editing page's list of outputs (#4044): a webview that gives no output names still gives a usable list, and a refusal is a toast, not red text.
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { DEFAULT_OUTPUT } from '../../engine/outputPrefs';
import { DeviceRow } from './OutputControls';
import { useOutputDevices } from './useOutputDevices';

type Device = { kind: string; deviceId: string; label: string };
let devices: Device[] = [];
const enumerate = vi.fn(async () => devices);

beforeEach(() => {
  (HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = () => Promise.resolve();
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { enumerateDevices: enumerate, addEventListener: vi.fn(), removeEventListener: vi.fn() } });
});
afterEach(() => {
  cleanup();
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  enumerate.mockReset();
  enumerate.mockImplementation(async () => devices);
});

function Row() {
  const { listing, refresh } = useOutputDevices();
  return <DeviceRow prefs={DEFAULT_OUTPUT} devices={listing} onChange={() => {}} onCheckDevices={refresh} />;
}

describe('the Editing page output list', () => {
  it('outputs with blank names are offered as Output 1 and Output 2, with no toast and no alert', async () => {
    devices = [
      { kind: 'audiooutput', deviceId: 'default', label: '' },
      { kind: 'audiooutput', deviceId: 'a1', label: '' },
      { kind: 'audiooutput', deviceId: 'b2', label: '' },
    ];
    const toast = vi.spyOn(overlay, 'toast');
    render(<Row />);
    const select = await screen.findByRole('combobox', { name: 'Output device' });
    await waitFor(() =>
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['System default', 'Output 1', 'Output 2']),
    );
    expect((select as HTMLInputElement).disabled).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a list that throws is said once as a toast, and every press of Check again says it again', async () => {
    enumerate.mockRejectedValue(new Error('NotAllowedError'));
    const toast = vi.spyOn(overlay, 'toast');
    const { result } = renderHook(() => useOutputDevices());
    await waitFor(() => expect(result.current.listing.phase).toBe('ready'));
    expect(toast).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(result.current.listing).toMatchObject({ phase: 'ready', status: 'unavailable' });
  });

  it('a press of Check again with the saved output still missing says so again; the first read says nothing', async () => {
    devices = [{ kind: 'audiooutput', deviceId: 'a1', label: 'Speakers' }];
    const toast = vi.spyOn(overlay, 'toast');
    const { result } = renderHook(() => useOutputDevices({ saved: 'Studio monitors', missingSentence: (name) => `${name} is gone.` }));
    await waitFor(() => expect(result.current.listing.phase).toBe('ready'));
    expect(toast).not.toHaveBeenCalled();
    act(() => result.current.refresh());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Studio monitors is gone.'));
    act(() => result.current.refresh());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
  });

  it('a refusal is said once, not again on every later read, and again on a press', async () => {
    enumerate.mockRejectedValue(new Error('NotAllowedError'));
    const toast = vi.spyOn(overlay, 'toast');
    const { result } = renderHook(() => useOutputDevices());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    act(() => void window.dispatchEvent(new Event('focus')));
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(enumerate).toHaveBeenCalledTimes(3));
    expect(toast).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
  });

  it('no output at all draws no toast and leaves the select on with the system default', async () => {
    devices = [{ kind: 'audiooutput', deviceId: 'default', label: 'Default' }];
    const toast = vi.spyOn(overlay, 'toast');
    render(<Row />);
    const select = await screen.findByRole('combobox', { name: 'Output device' });
    await waitFor(() => expect(enumerate).toHaveBeenCalled());
    expect((select as HTMLInputElement).disabled).toBe(false);
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['System default']);
    expect(toast).not.toHaveBeenCalled();
  });
});
