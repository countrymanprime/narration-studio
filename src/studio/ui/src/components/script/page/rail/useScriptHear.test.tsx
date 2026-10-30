// @vitest-environment jsdom
// Audit cluster 13 (docs/research/ui-function-audit.md): Hear on Script's "In this chapter" rows is the Story Bible's Hear, not a toast that says it played.
// It asks the host for the entry's preview (`guidePreview`) and plays it; a voice that is not installed says so in a sentence; a name with no entry has no Hear.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { InThisChapter } from './InThisChapter';
import { HEAR_NEEDS_VOICE, useScriptHear } from './useScriptHear';

class PreviewAudio {
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor(readonly src: string) {}
}
let audios: PreviewAudio[] = [];

beforeEach(() => {
  audios = [];
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'Audio',
    class extends PreviewAudio {
      constructor(src: string) {
        super(src);
        audios.push(this);
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Rows() {
  const hearOf = useScriptHear();
  return (
    <InThisChapter
      label="In this chapter"
      empty="none"
      rows={[
        { id: 'alice', name: 'Alice', hear: hearOf('alice', true) },
        { id: 'flag', name: 'kroh-KAY', hear: hearOf(undefined, true) },
      ]}
    />
  );
}

const mount = (api = createMockApi()) =>
  render(
    <ApiProvider api={api}>
      <Rows />
    </ApiProvider>,
  );

describe('Hear on Script', () => {
  it('plays the host preview of the Story Bible entry, as the Story Bible list does', async () => {
    const api = createMockApi();
    const preview = vi.spyOn(api, 'guidePreview').mockResolvedValue({ status: 'ready', audioBase64: 'UklGRg==', mimeType: 'audio/wav' });
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: 'Hear Alice' }));
    await waitFor(() => expect(audios).toHaveLength(1));
    expect(preview).toHaveBeenCalledWith('alice');
    expect(audios[0].play).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Alice' })).toBeTruthy());
  });

  it('says the preview voice is not installed, rather than toasting that a clip played', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guidePreview').mockResolvedValue({ status: 'asset_required', asset: 'tts', message: 'The voice is needed.' } as never);
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: 'Hear Alice' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(HEAR_NEEDS_VOICE));
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('reference clip'));
  });

  it('offers no Hear for a word with no Story Bible entry, which the host cannot speak', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Hear kroh-KAY' })).toBeNull();
  });
});
