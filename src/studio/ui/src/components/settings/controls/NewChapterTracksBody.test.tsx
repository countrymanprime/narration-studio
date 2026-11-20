// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { VoiceSetupProvider } from '../../engine/voiceLayout';
import { CUSTOM_CHANGED, type ProbeContext } from '../data/customChanged';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { SettingsHostProvider, type SettingsHost } from '../row/SettingsHost';
import { NEW_CHAPTER_DEFAULT_CHANGED, NewChapterTracksBody } from './NewChapterTracksBody';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const notify = vi.fn();
const host = { notify } as unknown as SettingsHost;
const mount = (api: NarrationApi) =>
  render(
    <ApiProvider api={api}>
      <SettingsHostProvider value={host}>
        <VoiceSetupProvider projectFolder="C:/Book">
          <NewChapterTracksBody />
        </VoiceSetupProvider>
      </SettingsHostProvider>
    </ApiProvider>,
  );

async function foldersApi() {
  const api = createMockApi({}, { voiceFolders: true });
  await api.voiceTracksSetCharacters('Mara', ['mara']);
  await api.voiceTracksSetCharacters('Dragon 🐉', ['dragon']);
  return api;
}

describe('the new chapter folder setting (#3748)', () => {
  it('is a project row under Recording, found by the words a narrator uses', () => {
    expect(ROWS.find((row) => row.id === 'daw.newChapter')).toMatchObject({ cat: 'recording', scope: 'project' });
    for (const query of ['new chapter folder', 'extras track', 'known voices create'])
      expect(search(query).some((hit) => hit.row?.id === 'daw.newChapter')).toBe(true);
  });

  it('shows the voices and Extras ticked, and keeps a tick as it is made', async () => {
    const api = await foldersApi();
    const save = vi.spyOn(api, 'chapterCreateDefaultSet');
    mount(api);
    const dragon = await screen.findByRole('checkbox', { name: 'Dragon 🐉' });
    expect(dragon.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(dragon);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ voices: ['Mara'], extras: true }));
    expect((await api.chapterCreateOptions()).voices).toEqual([
      { name: 'Dragon 🐉', checked: false },
      { name: 'Mara', checked: true },
    ]);
  });

  it('puts a tick back and says why when the choice could not be kept', async () => {
    const api = await foldersApi();
    vi.spyOn(api, 'chapterCreateDefaultSet').mockRejectedValue(new Error('the project is read-only'));
    mount(api);
    const extras = await screen.findByRole('checkbox', { name: 'Extras' });
    fireEvent.click(extras);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('read-only'), 'error'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Extras' }).getAttribute('aria-checked')).toBe('true'));
  });

  it('draws nothing for a flat project, and says so in a toast, not in the row, when the list cannot be read', async () => {
    mount(createMockApi());
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
    cleanup();
    const api = await foldersApi();
    vi.spyOn(api, 'chapterCreateOptions').mockRejectedValue(new Error('host down'));
    mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('could not be read'), 'error'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads the list again when the header puts the default back', async () => {
    const api = await foldersApi();
    mount(api);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Mara' }));
    await waitFor(async () => expect((await api.chapterCreateOptions()).voices.some((voice) => !voice.checked)).toBe(true));
    await api.chapterCreateDefaultSet({ voices: ['Mara', 'Dragon 🐉'], extras: true });
    window.dispatchEvent(new Event(NEW_CHAPTER_DEFAULT_CHANGED));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mara' }).getAttribute('aria-checked')).toBe('true'));
  });

  it('is Changed only while a voice or Extras is left out', async () => {
    const api = await foldersApi();
    const context = { api, settings: {}, delivery: async () => ({}) } as unknown as ProbeContext;
    expect(await CUSTOM_CHANGED['daw.newChapter']!(context)).toBe(false);
    await api.chapterCreateDefaultSet({ voices: ['Mara'], extras: true });
    expect(await CUSTOM_CHANGED['daw.newChapter']!(context)).toBe(true);
    await api.chapterCreateDefaultSet({ voices: ['Mara', 'Dragon 🐉'], extras: false });
    expect(await CUSTOM_CHANGED['daw.newChapter']!(context)).toBe(true);
    await api.chapterCreateDefaultSet({ voices: ['Mara', 'Dragon 🐉'], extras: true });
    expect(await CUSTOM_CHANGED['daw.newChapter']!(context)).toBe(false);
  });
});
