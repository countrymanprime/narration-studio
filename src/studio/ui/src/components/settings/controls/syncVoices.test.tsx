// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { MockApiSeed } from '../../../api/mockHost/state';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { useVoiceLayout, useVoiceSetup, VoiceSetupProvider } from '../../engine/voiceLayout';
import { TooltipProvider } from '../../primitives/Tooltip';
import { SettingsPage } from '../page/SettingsPage';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';

afterEach(cleanup);

/** What the Engine panel reads: the same app-wide voice setup the Settings row writes. */
function EnginePanelProbe() {
  const { replace } = useVoiceSetup();
  const layout = useVoiceLayout();
  return (
    <button type="button" onClick={() => replace({ layout: 'flat', narratorCharacter: '', tracks: [] })}>
      Engine panel layout: {layout}
    </button>
  );
}

async function renderSettings(seed: MockApiSeed = {}) {
  const api = createMockApi({}, { daw: {}, ...seed });
  const setEnabled = vi.spyOn(api, 'chapterSyncSetEnabled');
  const setNarrator = vi.spyOn(api, 'voiceTracksSetNarrator');
  const setCharacters = vi.spyOn(api, 'voiceTracksSetCharacters');
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
              <VoiceSetupProvider projectFolder={data.projectFolder}>
                <EnginePanelProbe />
                <main tabIndex={-1}>
                  <SettingsPage
                    data={data}
                    notify={vi.fn()}
                    onDirtyChange={vi.fn()}
                    registerActions={vi.fn()}
                    onProjectDataCleared={async () => undefined}
                    onLinkDawFile={vi.fn()}
                    go={vi.fn()}
                    refreshBootstrap={async () => undefined}
                  />
                </main>
              </VoiceSetupProvider>
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Recording & DAW/ }));
  await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
  return { api, setEnabled, setNarrator, setCharacters };
}

describe('the Chapter sync and Voices settings (parity audit)', () => {
  it('are project rows under Chapter sync, found by the words a narrator uses', () => {
    expect(ROWS.find((row) => row.id === 'daw.sync')).toMatchObject({ cat: 'recording', section: 'Chapter sync', scope: 'project', def: 'on' });
    expect(ROWS.find((row) => row.id === 'daw.voices')?.desc.length).toBeLessThanOrEqual(60);
    expect(ROWS.find((row) => row.id === 'daw.voices')).toMatchObject({ cat: 'recording', section: 'Chapter sync', scope: 'project', needs: 'reaper' });
    for (const query of ['sync chapters', 'link chapters automatically']) expect(search(query).some((hit) => hit.row?.id === 'daw.sync')).toBe(true);
    for (const query of ['narrator character', 'voice tracks', 'characters per track'])
      expect(search(query).some((hit) => hit.row?.id === 'daw.voices')).toBe(true);
  });

  it('turns Chapter sync off and on from Settings, the host call the Engine panel makes', async () => {
    const { setEnabled } = await renderSettings({ chapterSync: 'linked' });
    const group = await screen.findByRole('radiogroup', { name: 'Sync chapters to tracks' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false));
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true'));
    await waitFor(() => expect(document.querySelector('[data-row="daw.sync"]')?.textContent).toContain('Changed'));
    fireEvent.click(within(group).getByRole('radio', { name: 'On' }));
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  });

  it('shows no choice on either button while the narrator has not decided', async () => {
    await renderSettings({ chapterSync: 'ask' });
    const group = await screen.findByRole('radiogroup', { name: 'Sync chapters to tracks' });
    for (const radio of within(group).getAllByRole('radio')) expect(radio.getAttribute('aria-checked')).toBe('false');
  });

  it('draws nothing under the Voices label while the project is flat, and no instruction prose', async () => {
    await renderSettings();
    const row = document.querySelector<HTMLElement>('[data-row="daw.voices"]')!;
    expect(row).toBeTruthy();
    expect(within(row).queryByRole('table')).toBeNull();
    expect(row.textContent).not.toMatch(/Choose Voice folders|Each chapter records/);
  });

  it('lists a folder’s voices and saves who a track records, as the Engine panel’s Voices card does', async () => {
    const { setCharacters } = await renderSettings({ voiceFolders: true });
    const row = document.querySelector<HTMLElement>('[data-row="daw.voices"]')!;
    const table = await within(row).findByRole('table', { name: /^Voices of / });
    expect(table).toBeTruthy();
    // The row's label is the title: the card draws no second "Voices" heading or frame of its own.
    expect(within(row).getAllByText('Voices')).toHaveLength(1);
    fireEvent.click(within(row).getAllByRole('button', { name: /^Choose who the .* track records$/ })[0]!);
    const list = await screen.findByRole('list', { name: 'Characters' });
    fireEvent.click(within(list).getAllByRole('checkbox')[0]!);
    await waitFor(() => expect(setCharacters).toHaveBeenCalled());
  });

  it('keeps the last of two quick choices, sent once the first has answered', async () => {
    const { setEnabled } = await renderSettings({ chapterSync: 'linked' });
    const group = await screen.findByRole('radiogroup', { name: 'Sync chapters to tracks' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Off' }));
    fireEvent.click(within(group).getByRole('radio', { name: 'On' }));
    await waitFor(() => expect(setEnabled.mock.calls.map(([on]) => on)).toEqual([false, true]));
  });

  it('offers Reset to On while Chapter sync is off, and Reset turns it on', async () => {
    const { setEnabled } = await renderSettings({ chapterSync: 'off' });
    const reset = await screen.findByRole('button', { name: 'Reset Sync chapters to tracks to On' });
    fireEvent.click(reset);
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  });

  it('reads the tracks again when the window is focused, so a track changed in REAPER is not offered stale', async () => {
    const { api } = await renderSettings({ voiceFolders: true });
    const list = vi.spyOn(api, 'tracksList');
    const row = document.querySelector<HTMLElement>('[data-row="daw.voices"]')!;
    await within(row).findByRole('table', { name: /^Voices of / });
    const before = list.mock.calls.length;
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });
});
