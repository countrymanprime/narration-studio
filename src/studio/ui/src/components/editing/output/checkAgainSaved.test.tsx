// @vitest-environment jsdom
// #4044, rule 9: on the Editing page's Output popover and on Settings > Editing playback, Check again with a saved output that is still missing answers.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { DEFAULT_OUTPUT, OUTPUT_STORAGE_KEY } from '../../engine/outputPrefs';
import { missingOutputSentence } from '../../voicesamples/audioOutputs';
import { PlaybackBody } from '../../settings/controls/AppearanceBodies';
import { EditingOutput } from './EditingOutput';

beforeEach(() => {
  (HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = () => Promise.resolve();
  const devices = [{ kind: 'audiooutput', deviceId: 'a1', label: 'Speakers' }];
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { enumerateDevices: async () => devices, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Check again with the saved output still missing', () => {
  it('the Editing Output popover says again that it is gone', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    render(<EditingOutput prefs={{ ...DEFAULT_OUTPUT, device: 'Studio monitors' }} onChange={() => {}} caps={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show volume and output device' }));
    const again = await screen.findByRole('button', { name: 'Check again' });
    expect(toast).not.toHaveBeenCalled();
    fireEvent.click(again);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(missingOutputSentence('Studio monitors', 'Sound plays')));
  });

  it('Settings > Editing playback says again that it is gone', async () => {
    window.localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ ...DEFAULT_OUTPUT, device: 'Studio monitors' }));
    const toast = vi.spyOn(overlay, 'toast');
    render(<PlaybackBody />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(missingOutputSentence('Studio monitors', 'Sound plays')));
  });

  // Round 4 found the Settings page raising toasts on open: neither page says anything about the list until Check again is pressed.
  it('opening the Editing popover or the Playback row with a list that throws raises no toast', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { enumerateDevices: () => Promise.reject(new Error('NotAllowedError')), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    const toast = vi.spyOn(overlay, 'toast');
    render(<EditingOutput prefs={DEFAULT_OUTPUT} onChange={() => {}} caps={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show volume and output device' }));
    await screen.findByRole('button', { name: 'Check again' });
    cleanup();
    render(<PlaybackBody />);
    await screen.findByRole('button', { name: 'Check again' });
    expect(toast).not.toHaveBeenCalled();
  });
});
