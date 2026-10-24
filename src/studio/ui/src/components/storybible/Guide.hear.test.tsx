// @vitest-environment jsdom
// The entry list's Hear button and Space play an entry's pronunciation with the host's preview, the same one the entry's own play button
// plays (SNB-D3). A voice that is not installed yet opens the entry, whose install prompt says what is needed.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { entryRows } from './entryTableTestKit';
import { Guide } from './Guide';

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

async function renderGuide(ready = true) {
  window.localStorage.clear();
  const api = createMockApi();
  const preview = ready
    ? vi.spyOn(api, 'guidePreview').mockResolvedValue({ status: 'ready', audioBase64: 'UklGRg==', mimeType: 'audio/wav' })
    : vi.spyOn(api, 'guidePreview');
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return { api, preview };
}
const row = (name: string) => entryRows().find((r) => r.querySelector('[data-entry-name]')?.textContent === name)!;

describe('the-entry-list-plays-a-pronunciation', () => {
  it('plays the entry pressed, without opening it, and stops it on a second press', async () => {
    const { preview } = await renderGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Hear Hatter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Hatter' })).toBeTruthy());
    expect(preview).toHaveBeenCalledWith('mad-hatter');
    expect(audios).toHaveLength(1);
    expect(row('Hatter').getAttribute('aria-selected')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Stop Hatter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hear Hatter' })).toBeTruthy());
    expect(audios[0]!.pause).toHaveBeenCalled();
  });

  it('plays another entry in place of the one playing', async () => {
    const { preview } = await renderGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Hear Hatter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Hatter' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Hear Alice' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Alice' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Hear Hatter' })).toBeTruthy();
    expect(preview).toHaveBeenLastCalledWith('alice');
    expect(audios).toHaveLength(2);
  });

  it('plays on Space on a row', async () => {
    const { preview } = await renderGuide();
    act(() => row('Hatter').focus());
    fireEvent.keyDown(row('Hatter'), { key: ' ' });
    await waitFor(() => expect(preview).toHaveBeenCalledWith('mad-hatter'));
  });

  it('opens the entry with its install prompt when the voice is not installed', async () => {
    await renderGuide(false);
    fireEvent.click(screen.getByRole('button', { name: 'Hear Hatter' }));
    await waitFor(() => expect(row('Hatter').getAttribute('aria-selected')).toBe('true'));
    expect(await screen.findByText(/This local voice is needed to play “Hatter”/)).toBeTruthy();
  });
});
